const OBUNTO_RTC = (() => {
  const peers = new Map();
  const remoteStreams = new Map();
  const audioRegistry = new Map();
  const extraTracks = new Map();
  const pendingAudioContexts = new Set();
  let localStream = null;
  let currentRoomId = null;
  const onTrackHandlers = [];
  const onLeaveHandlers = [];

  function unlockPendingAudioContexts() {
    pendingAudioContexts.forEach(ctx => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    });
  }

  ['click', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, unlockPendingAudioContexts, { passive: true });
  });

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

  function applyVideoSenderParams(sender, maxBitrateKbps) {
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = (maxBitrateKbps || 2000) * 1000;
    params.degradationPreference = 'maintain-framerate';
    sender.setParameters(params).catch(() => {});
  }

  function addTrack(track, stream) {
    extraTracks.set(track, stream);
    peers.forEach(pc => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') applyVideoSenderParams(sender, 2000);
    });
  }

  function removeTrackByKind(kind) {
    Array.from(extraTracks.keys()).forEach(track => {
      if (track.kind === kind) extraTracks.delete(track);
    });
    peers.forEach(pc => {
      pc.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === kind) pc.removeTrack(sender);
      });
    });
  }

  function removeSpecificTrack(track) {
    extraTracks.delete(track);
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

  function getAudioEntry(userId) {
    let entry = audioRegistry.get(userId);
    if (!entry) {
      entry = { tracks: new Set(), mixer: null };
      audioRegistry.set(userId, entry);
    }
    return entry;
  }

  function teardownMixer(entry) {
    if (!entry.mixer) return;
    entry.mixer.sources.forEach(node => node.disconnect());
    entry.mixer.sources.clear();
    entry.mixer.dest.disconnect();
    pendingAudioContexts.delete(entry.mixer.ctx);
    entry.mixer.ctx.close().catch(() => {});
    entry.mixer = null;
  }

  function rebuildAudioForUser(userId) {
    const stream = combinedStream(userId);
    const entry = audioRegistry.get(userId);

    if (!entry || entry.tracks.size === 0) {
      if (entry) teardownMixer(entry);
      stream.getTracks().filter(t => t.kind === 'audio').forEach(t => stream.removeTrack(t));
      onTrackHandlers.forEach(fn => fn(userId, stream, 'audio'));
      return;
    }

    if (entry.tracks.size === 1) {
      teardownMixer(entry);
      const onlyTrack = Array.from(entry.tracks)[0];
      stream.getTracks().filter(t => t.kind === 'audio' && t !== onlyTrack).forEach(t => stream.removeTrack(t));
      if (stream.getTracks().indexOf(onlyTrack) === -1) stream.addTrack(onlyTrack);
      onTrackHandlers.forEach(fn => fn(userId, stream, 'audio'));
      return;
    }

    if (!entry.mixer) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const dest = ctx.createMediaStreamDestination();
      entry.mixer = { ctx, dest, sources: new Map() };
      pendingAudioContexts.add(ctx);
    }
    if (entry.mixer.ctx.state === 'suspended') entry.mixer.ctx.resume().catch(() => {});

    entry.tracks.forEach(track => {
      if (!entry.mixer.sources.has(track)) {
        const sourceNode = entry.mixer.ctx.createMediaStreamSource(new MediaStream([track]));
        sourceNode.connect(entry.mixer.dest);
        entry.mixer.sources.set(track, sourceNode);
      }
    });

    const mergedTrack = entry.mixer.dest.stream.getAudioTracks()[0];
    stream.getTracks().filter(t => t.kind === 'audio' && t !== mergedTrack).forEach(t => stream.removeTrack(t));
    if (stream.getTracks().indexOf(mergedTrack) === -1) stream.addTrack(mergedTrack);
    onTrackHandlers.forEach(fn => fn(userId, stream, 'audio'));
  }

  function attachRemoteAudioTrack(userId, track) {
    const entry = getAudioEntry(userId);
    entry.tracks.add(track);
    rebuildAudioForUser(userId);

    track.addEventListener('ended', () => {
      entry.tracks.delete(track);
      if (entry.mixer) {
        const node = entry.mixer.sources.get(track);
        if (node) {
          node.disconnect();
          entry.mixer.sources.delete(track);
        }
      }
      rebuildAudioForUser(userId);
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
    extraTracks.forEach((stream, track) => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') applyVideoSenderParams(sender, 2000);
    });

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

  function teardownAudioForUser(userId) {
    const entry = audioRegistry.get(userId);
    if (!entry) return;
    teardownMixer(entry);
    entry.tracks.clear();
    audioRegistry.delete(userId);
  }

  function removePeer(userId) {
    const pc = peers.get(userId);
    if (pc) {
      pc.close();
      peers.delete(userId);
    }
    remoteStreams.delete(userId);
    teardownAudioForUser(userId);
    onLeaveHandlers.forEach(fn => fn(userId));
  }

  function closeAll() {
    peers.forEach(pc => pc.close());
    peers.clear();
    remoteStreams.clear();
    Array.from(audioRegistry.keys()).forEach(teardownAudioForUser);
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