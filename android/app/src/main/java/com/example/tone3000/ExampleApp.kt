package com.example.tone3000

import android.app.Application
import com.example.tone3000.audio.PreviewAssets
import com.example.tone3000.audio.PreviewPlayer
import com.example.tone3000.t3k.T3KClient
import com.example.tone3000.t3k.TokenStore
import kotlinx.coroutines.MainScope

/** App-wide singletons shared by every demo. */
object T3K {
    lateinit var client: T3KClient
        private set
    lateinit var player: PreviewPlayer
        private set

    internal fun init(app: Application) {
        client = T3KClient(TokenStore(app), app.cacheDir)
        player = PreviewPlayer(MainScope())
        PreviewAssets.init(app)
    }
}

class ExampleApp : Application() {
    override fun onCreate() {
        super.onCreate()
        T3K.init(this)
    }
}
