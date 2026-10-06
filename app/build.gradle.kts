plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.lio.clocktimer"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.lio.clocktimer"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        create("release") {
            storeFile = file("larps-release.keystore")
            storePassword = "${System.getenv("KEYSTORE_PASSWORD") ?: "larps_secure_pass"}"
            keyAlias = "lio_release_key"
            keyPassword = "${System.getenv("KEY_PASSWORD") ?: "larps_secure_pass"}"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")

    // Android WebKit & Bridge
    implementation("androidx.webkit:webkit:1.10.0")

    // Biometric Hardware Authentication
    implementation("androidx.biometric:biometric:1.2.0-alpha05")

    // Robust Background Sync (WorkManager)
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // Location & Play Services
    implementation("com.google.android.gms:play-services-location:21.1.0")

    // Media & CameraX
    implementation("androidx.camera:camera-camera2:1.3.1")
    implementation("androidx.camera:camera-lifecycle:1.3.1")
}
