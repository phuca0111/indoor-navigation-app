plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// Điện thoại thật: cùng WiFi với laptop. Đổi IP nếu ipconfig khác 192.168.2.29
val DEV_SERVER_IP = "192.168.2.29"
val DEV_SERVER_PORT = "5000"

android {
    namespace = "com.tptp.bank"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tptp.bank"
        minSdk = 24
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"
        buildConfigField(
            "String",
            "BASE_URL",
            "\"http://$DEV_SERVER_IP:$DEV_SERVER_PORT/api/tptp-bank/\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

// Android Studio có thể còn cache variant cũ (emulatorDebug / localDebug)
afterEvaluate {
    tasks.findByName("assembleDebug")?.let { assembleDebug ->
        listOf("assembleEmulatorDebug", "assembleLocalDebug").forEach { legacyName ->
            if (tasks.findByName(legacyName) == null) {
                tasks.register(legacyName) {
                    group = "build"
                    description = "Alias → assembleDebug (variant cũ đã gỡ)"
                    dependsOn(assembleDebug)
                }
            }
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.retrofit)
    implementation(libs.converter.gson)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.guava)
    implementation(libs.com.google.mlkit.barcode.scanning)
}
