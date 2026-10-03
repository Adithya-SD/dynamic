plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

android {
    namespace = "dev.dynamic"
    compileSdk = 35
    defaultConfig {
        applicationId = "dev.dynamic.app"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildTypes { release { isMinifyEnabled = false } }
    // The app is the web engine: docs/ (built by tools/build_web.py) is bundled as assets.
    sourceSets { getByName("main") { assets.srcDir(rootProject.file("docs")) } }
}
