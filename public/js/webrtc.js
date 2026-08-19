const OBUNTO_RTC = (() => {
  const peers = new Map();
  const remoteStreams = new Map();
  const audioMixers = new Map();
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

  function getAudioMixer(userId) {
    let mixer = audioMixers.get(userId);
    if (!mixer) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const dest = ctx.createMediaStreamDestination();
      mixer = { ctx, dest, sources: new Map() };
      audioMixers.set(userId, mixer);
    }
    if (mixer.ctx.state === 'suspended') mixer.ctx.resume().catch(() => {});
    return mixer;
  }

  function attachRemoteAudioTrack(userId, track) {
    const stream = combinedStream(userId);
    const mixer = getAudioMixer(userId);

    const sourceStream = new MediaStream([track]);
    const sourceNode = mixer.ctx.createMediaStreamSource(sourceStream);
    sourceNode.connect(mixer.dest);
    mixer.sources.set(track, sourceNode);

    const mergedTrack = mixer.dest.stream.getAudioTracks()[0];
    stream.getTracks().filter(t => t.kind === 'audio' && t !== mergedTrack).forEach(t => stream.removeTrack(t));
    if (stream.getTracks().indexOf(mergedTrack) === -1) stream.addTrack(mergedTrack);

    onTrackHandlers.forEach(fn => fn(userId, stream, 'audio'));

    track.addEventListener('ended', () => {
      const node = mixer.sources.get(track);
      if (node) {
        node.disconnect();
        mixer.sources.delete(track);
      }
    });
  }

  function attachRemoteVideoTrack(userId, track) {
    const stream = combinedStream(userId);
    stream.getTracks().filter(t => t.kind === 'video').forEach(t => stream.removeTrack(t));
    stream.addTrack(track);
    onTrackHandlers.forEach(fn => fn(userId, stream, 'video'));

    track.addEventListener('ended', () => {
      if (stream.getTracks().indexOf(track) === -1) return;
      stream.removeTrack(track);
      onTrackHandlers.forEach(fn => fn(userId, stream, 'video'));
    });
  }

  function attachRemoteTrack(userId, track) {
    if (track.kind === 'video') {
      attachRemoteVideoTrack(userId, track);
    } else {
      attachRemoteAudioTrack(userId, track);
    }
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

  function teardownAudioMixer(userId) {
    const mixer = audioMixers.get(userId);
    if (!mixer) return;
    mixer.sources.forEach(node => node.disconnect());
    mixer.sources.clear();
    mixer.dest.disconnect();
    mixer.ctx.close().catch(() => {});
    audioMixers.delete(userId);
  }

  function removePeer(userId) {
    const pc = peers.get(userId);
    if (pc) {
      pc.close();
      peers.delete(userId);
    }
    remoteStreams.delete(userId);
    teardownAudioMixer(userId);
    onLeaveHandlers.forEach(fn => fn(userId));
  }

  function closeAll() {
    peers.forEach(pc => pc.close());
    peers.clear();
    remoteStreams.clear();
    Array.from(audioMixers.keys()).forEach(teardownAudioMixer);
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