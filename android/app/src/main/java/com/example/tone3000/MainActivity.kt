package com.example.tone3000

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.tone3000.ui.ExampleTheme
import com.example.tone3000.ui.FullApiDemoScreen
import com.example.tone3000.ui.LandingScreen
import com.example.tone3000.ui.LoadToneDemoScreen
import com.example.tone3000.ui.SelectDemoScreen
import com.example.tone3000.ui.ToneDetailScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ExampleTheme {
                val nav = rememberNavController()
                val back: () -> Unit = { nav.popBackStack() }
                NavHost(nav, startDestination = "landing") {
                    composable("landing") { LandingScreen(open = { nav.navigate(it) }) }
                    composable("select") { SelectDemoScreen(back) }
                    composable("load-tone") { LoadToneDemoScreen(back) }
                    composable("full-api") { FullApiDemoScreen(back, openTone = { nav.navigate("tone/$it") }) }
                    composable("tone/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) { entry ->
                        ToneDetailScreen(entry.arguments?.getInt("id") ?: 0, back)
                    }
                }
            }
        }
    }
}
