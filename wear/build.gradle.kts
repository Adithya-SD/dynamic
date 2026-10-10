plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

android {
    namespace = "dev.dynamic.watch"
    compileSdk = 35
    defaultConfig {
        applicationId = "dev.dynamic.watch"
        minSdk = 30
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildTypes { release { isMinifyEnabled = false } }
    // Only the watch page is bundled (docs/watch.html, written by tools/build_web.py).
    sourceSets { getByName("main") { assets.srcDir(layout.buildDirectory.dir("watchAssets")) } }
}

val copyWatch = tasks.register<Copy>("copyWatch") {
    from(rootProject.file("docs/watch.html"))
    into(layout.buildDirectory.dir("watchAssets"))
}
tasks.named("preBuild") { dependsOn(copyWatch) }
