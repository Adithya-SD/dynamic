package dev.dynamic

/** Dynamic Pad: the controller as a music feeler. Same shell, its own page, keeps listening in the background. */
class PadActivity : MainActivity() {
    override val page = "pad.html"
    override val keepAudio = true
}
