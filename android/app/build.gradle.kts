import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val localProperties = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

/** -P / gradle.properties first, then local.properties. */
fun t3kProperty(name: String, default: String = ""): String =
    (project.findProperty(name) as String?) ?: localProperties.getProperty(name) ?: default

val redirectScheme = t3kProperty("T3K_REDIRECT_SCHEME", "tone3000-example")

android {
    namespace = "com.example.tone3000"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.example.tone3000"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "T3K_PUBLISHABLE_KEY", "\"${t3kProperty("T3K_PUBLISHABLE_KEY")}\"")
        buildConfigField("String", "T3K_API_BASE", "\"${t3kProperty("T3K_API_BASE", "https://www.tone3000.com")}\"")
        buildConfigField("String", "T3K_REDIRECT_SCHEME", "\"$redirectScheme\"")

        externalNativeBuild {
            cmake {
                cppFlags += "-std=c++20"
                arguments += listOf("-DANDROID_STL=c++_shared", "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON")
            }
        }
        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    externalNativeBuild {
        cmake {
            // JNI bridge + the shared engine from ../native/preview-engine
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    sourceSets {
        // Bundled DI clip + fallback amp/cab shared with the other native examples
        getByName("main").assets.srcDir("../../native/preview-assets")
    }

    buildFeatures {
        compose = true
        buildConfig = true
        // Oboe ships prefab-packaged native libs
        prefab = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.androidx.security.crypto)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.coil.compose)
    implementation(libs.oboe)
}
