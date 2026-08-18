const OBUNTO_RTC = (() => {
  const peers = new Map();
  const remoteStreams = new Map();
  let localStream = null;
  let currentRoomId = null;
  const onTrackHandlers = [];
  const onLeaveHandlers = [];

  function setRoom(roomId) {
    currentRoomId = roomId;
  }

  function boostOpus(sdp) {
    return sdp.replace(
      /a=rtpmap:(\d+) opus\/48000\/2\r\n/g,
      (match, pt) => match + 'a=fmtp:' + pt + ' minptime=10;useinbandfec=1;stereo=0;maxaveragebitrate=64000;usedtx=0\r\n'
    );
  }

  function setLocalStream(stream) {
    localStream = stream;
    peers.forEach(pc => {
      const senders = pc.getSenders();
      stream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track && s.track.kind === track.kind);
        if (sender) sender.replaceTrack(track);
        else pc.addTrack(track, stream);
      });
    });
  }

  function addTrack(track, stream) {
    peers.forEach(pc => pc.addTrack(track, stream));
  }

  function removeTrackByKind(kind) {
    peers.forEach(pc => {
      pc.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === kind) pc.removeTrack(sender);
      });
    });
  }

  function removeSpecificTrack(track) {
    peers.forEach(pc => {
      pc.getSenders().forEach(sender => {
        if (sender.track === track) pc.removeTrack(sender);
      });
    });
  }

  function applyAudioSenderParams(pc) {
    pc.getSenders().forEach(sender => {
      if (!sender.track || sender.track.kind !== 'audio') return;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = 64000;
      sender.setParameters(params).catch(() => {});
    });
  }

  function combinedStream(userId) {
    let stream = remoteStreams.get(userId);
    if (!stream) {
      stream = new MediaStream();
      remoteStreams.set(userId, stream);
    }
    return stream;
  }

  function attachRemoteTrack(userId, track) {
    const stream = combinedStream(userId);
    stream.getTracks().filter(t => t.kind === track.kind).forEach(t => {
      stream.removeTrack(t);
    });
    stream.addTrack(track);
    onTrackHandlers.forEach(fn => fn(userId, stream, track.kind));

    track.addEventListener('ended', () => {
      if (stream.getTracks().indexOf(track) === -1) return;
      stream.removeTrack(track);
      onTrackHandlers.forEach(fn => fn(userId, stream, track.kind));
    });
  }

  function createPeer(userId, isInitiator) {
    if (peers.has(userId)) return peers.get(userId);

    const pc = new RTCPeerConnection({ iceServers: OBUNTO_CONFIG.iceServers });
    pc.polite = !isInitiator;
    pc.makingOffer = false;
    pc.ignoreOffer = false;
    peers.set(userId, pc);

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = e => {
      if (e.candidate) OBUNTO_SIGNAL.signal(currentRoomId, userId, { kind: 'ice', candidate: e.candidate });
    };

    pc.ontrack = e => {
      attachRemoteTrack(userId, e.track);
    };

    pc.onnegotiationneeded = async () => {
      try {
        pc.makingOffer = true;
        const offer = await pc.createOffer();
        offer.sdp = boostOpus(offer.sdp);
        await pc.setLocalDescription(offer);
        applyAudioSenderParams(pc);
        OBUNTO_SIGNAL.signal(currentRoomId, userId, { kind: 'offer', sdp: pc.localDescription });
      } catch (e) {}
      pc.makingOffer = false;
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' && typeof pc.restartIce === 'function') {
        pc.restartIce();
      }
    };

    return pc;
  }

  async function handleSignal(from, data) {
    let pc = peers.get(from);
    if (!pc) pc = createPeer(from, false);

    if (data.kind === 'offer') {
      const offerCollision = pc.makingOffer || pc.signalingState !== 'stable';
      pc.ignoreOffer = !pc.polite && offerCollision;
      if (pc.ignoreOffer) return;

      if (offerCollision) {
        await Promise.all([
          pc.setLocalDescription({ type: 'rollback' }).catch(() => {}),
          pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        ]);
      } else {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      }

      const answer = await pc.createAnswer();
      answer.sdp = boostOpus(answer.sdp);
      await pc.setLocalDescription(answer);
      applyAudioSenderParams(pc);
      OBUNTO_SIGNAL.signal(currentRoomId, from, { kind: 'answer', sdp: pc.localDescription });
    }

    if (data.kind === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }

    if (data.kind === 'ice') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {}
    }
  }

  function removePeer(userId) {
    const pc = peers.get(userId);
    if (pc) {
      pc.close();
      peers.delete(userId);
    }
    remoteStreams.delete(userId);
    onLeaveHandlers.forEach(fn => fn(userId));
  }

  function closeAll() {
    peers.forEach(pc => pc.close());
    peers.clear();
    remoteStreams.clear();
  }

  function onTrack(fn) {
    onTrackHandlers.push(fn);
  }

  function onLeave(fn) {
    onLeaveHandlers.push(fn);
  }

  return {
    createPeer,
    handleSignal,
    removePeer,
    closeAll,
    setLocalStream,
    addTrack,
    removeTrackByKind,
    removeSpecificTrack,
    onTrack,
    onLeave,
    setRoom
  };
})();
