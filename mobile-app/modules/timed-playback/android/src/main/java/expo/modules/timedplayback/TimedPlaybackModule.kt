package expo.modules.timedplayback

import android.os.Handler
import android.os.Looper
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.PlayerMessage
import androidx.media3.exoplayer.SeekParameters
import expo.modules.audio.AudioPlayer
import expo.modules.video.player.VideoPlayer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.sharedobjects.SharedObject
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs
import kotlin.math.roundToLong

@UnstableApi
class TimedPlaybackModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private data class Session(val player: ExoPlayer, val endMs: Long?, var pending: Promise?, var message: PlayerMessage? = null,
    var listener: Player.Listener? = null, var tick: Runnable? = null)
  private val sessions = mutableMapOf<String, Session>()
  private val snapshots = ConcurrentHashMap<String, Map<String, Any>>()
  private fun snapshot(id: String, s: Session, ended: Boolean = false): Map<String, Any> {
    val data = mapOf<String, Any>("positionUs" to ((if (ended) s.endMs ?: s.player.duration else s.player.currentPosition).coerceAtLeast(0) * 1000),
      "durationUs" to (s.player.duration.coerceAtLeast(0) * 1000), "playing" to s.player.isPlaying,
      "buffering" to (s.player.playbackState == Player.STATE_BUFFERING), "ended" to ended)
    snapshots[id] = data; return data
  }
  private fun clear(id: String) {
    val s = sessions.remove(id) ?: return
    s.player.pause(); s.message?.cancel(); s.listener?.let { s.player.removeListener(it) }
    s.tick?.let { handler.removeCallbacks(it) }
    s.pending?.reject("CANCELLED", "Playback request cancelled", null); s.pending = null; snapshots.remove(id)
  }
  override fun definition() = ModuleDefinition {
    Name("TimedPlayback")
    Events("onRangeEnd")
    AsyncFunction("configure") { shared: SharedObject, id: String, start: Double, end: Double?, promise: Promise ->
      val player = when (shared) { is AudioPlayer -> shared.ref; is VideoPlayer -> shared.player; else -> null }
      if (player == null || !start.isFinite() || start < 0 || (end != null && (!end.isFinite() || end <= start))) {
        promise.reject("INVALID_RANGE", "Invalid player or playback range", null)
      } else {
        sessions.filterValues { it.player === player }.keys.toList().forEach { clear(it) }
        player.pause(); player.setSeekParameters(SeekParameters.EXACT)
        val targetMs = (start * 1000).roundToLong(); val endMs = end?.let { kotlin.math.ceil(it * 1000).toLong() }
        val s = Session(player, endMs, promise); sessions[id] = s
        fun confirm() {
          if (sessions[id] !== s || player.playbackState != Player.STATE_READY || abs(player.currentPosition-targetMs) > 50) return
          s.pending?.resolve(snapshot(id,s)); s.pending = null
        }
        val listener = object : Player.Listener {
          override fun onPlaybackStateChanged(state: Int) {
            if (sessions[id] !== s) return
            confirm()
            if (state == Player.STATE_ENDED) { snapshot(id,s,true); sendEvent("onRangeEnd",mapOf("id" to id)) }
          }
          override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) { if (reason == Player.DISCONTINUITY_REASON_SEEK) confirm() }
          override fun onPlayerError(error: androidx.media3.common.PlaybackException) { s.pending?.reject("PLAYBACK_FAILED", error.message, error); s.pending = null }
        }
        s.listener=listener; player.addListener(listener)
        // Media3 schedules this against media time, so buffering/rate changes do not trigger an early stop.
        // The native main looper pauses the player; there is no JS timer in the stopping path.
        if (endMs != null) s.message=player.createMessage { _, _ ->
          if (sessions[id] === s) { player.pause(); snapshot(id,s,true); sendEvent("onRangeEnd",mapOf("id" to id)) }
        }.setLooper(Looper.getMainLooper()).setPosition(endMs).setDeleteAfterDelivery(true).send()
        s.tick=object : Runnable { override fun run() { if (sessions[id] !== s) return; snapshot(id,s); handler.postDelayed(this,20) } }
        handler.post(s.tick!!)
        player.seekTo(targetMs)
        confirm()
      }
    }.runOnQueue(Queues.MAIN)
    Function("snapshot") { id: String -> snapshots[id] }
    AsyncFunction("clear") { id: String -> clear(id) }.runOnQueue(Queues.MAIN)
    OnDestroy { handler.post { sessions.keys.toList().forEach { clear(it) } } }
  }
}
