import AVFoundation
import ExpoModulesCore

public class TimedPlaybackModule: Module {
  private final class Session {
    let player: AVPlayer
    let end: Double?
    var periodic: Any?
    var endedObserver: NSObjectProtocol?
    var pending: Promise?
    init(_ player: AVPlayer, _ end: Double?, _ pending: Promise) {
      self.player = player; self.end = end; self.pending = pending
    }
  }
  // AVPlayer mutations and sessions live on main. JS reads immutable cached snapshots under a lock.
  private var sessions: [String: Session] = [:]
  private var snapshots: [String: [String: Any]] = [:]
  private let lock = NSLock()

  private func update(_ id: String, _ session: Session, ended: Bool = false) -> [String: Any] {
    let time = session.player.currentTime().seconds
    let duration = session.player.currentItem?.duration.seconds ?? 0
    let position = ended ? (session.end ?? duration) : time
    let value: [String: Any] = [
      "positionUs": Int64(((position.isFinite ? position : 0) * 1_000_000).rounded()),
      "durationUs": Int64(((duration.isFinite ? duration : 0) * 1_000_000).rounded()),
      "playing": session.player.timeControlStatus == .playing,
      "buffering": session.player.timeControlStatus == .waitingToPlayAtSpecifiedRate,
      "ended": ended
    ]
    lock.lock(); snapshots[id] = value; lock.unlock()
    return value
  }
  private func clear(_ id: String) {
    guard let session = sessions.removeValue(forKey: id) else { return }
    session.player.pause()
    session.player.currentItem?.cancelPendingSeeks()
    session.player.currentItem?.forwardPlaybackEndTime = .invalid
    if let periodic = session.periodic { session.player.removeTimeObserver(periodic) }
    if let observer = session.endedObserver { NotificationCenter.default.removeObserver(observer) }
    session.pending?.reject("CANCELLED", "Playback request cancelled"); session.pending = nil
    lock.lock(); snapshots.removeValue(forKey: id); lock.unlock()
  }
  public func definition() -> ModuleDefinition {
    Name("TimedPlayback")
    Events("onRangeEnd")
    AsyncFunction("configure") { (shared: SharedRef<AVPlayer>, id: String, start: Double, end: Double?, promise: Promise) in
      let player = shared.ref
      for previous in self.sessions.keys.filter({ self.sessions[$0]?.player === player }) { self.clear(previous) }
      guard start.isFinite, start >= 0, end == nil || (end!.isFinite && end! > start), let item = player.currentItem else {
        promise.reject("INVALID_RANGE", "Invalid playback range"); return
      }
      player.pause()
      let session = Session(player, end, promise); self.sessions[id] = session
      // AVFoundation stops at the source boundary; JS delivery latency does not determine the stop.
      item.forwardPlaybackEndTime = end.map { CMTime(seconds: $0, preferredTimescale: 1_000_000) } ?? .invalid
      session.periodic = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 50), queue: .main) { [weak self] _ in
        guard let self, self.sessions[id] === session else { return }; _ = self.update(id, session)
      }
      session.endedObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
        guard let self, self.sessions[id] === session else { return }
        _ = self.update(id, session, ended: true); self.sendEvent("onRangeEnd", ["id": id])
      }
      player.seek(to: CMTime(seconds: start, preferredTimescale: 1_000_000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
        DispatchQueue.main.async {
          guard let self, self.sessions[id] === session else { return }
          let pending = session.pending; session.pending = nil
          if finished { pending?.resolve(self.update(id, session)) }
          else { pending?.reject("SEEK_FAILED", "Native seek was not completed") }
        }
      }
    }.runOnQueue(.main)
    Function("snapshot") { (id: String) -> [String: Any]? in
      self.lock.lock(); defer { self.lock.unlock() }; return self.snapshots[id]
    }
    AsyncFunction("clear") { (id: String) in self.clear(id) }.runOnQueue(.main)
    OnDestroy {
      DispatchQueue.main.async { for id in Array(self.sessions.keys) { self.clear(id) } }
    }
  }
}
