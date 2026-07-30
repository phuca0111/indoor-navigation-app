plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// Điện thoại thật (local): cùng WiFi với laptop — cập nhật IPv4 từ ipconfig.
val DEV_SERVER_IP = "192.168.2.21"
val DEV_SERVER_PORT = "5000"
val PROD_API_BASE = "https://indoor-navigation-app-sqiu.onrender.com/api/tptp-bank/"

android {
    namespace = "com.tptp.bank"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tptp.bank"
        minSdk = 24
        targetSdk = 36
        versionCode = 3
        versionName = "1.1.0"
    }

    flavorDimensions += "env"
    productFlavors {
        create("local") {
            dimension = "env"
            buildConfigField(
                "String",
                "BASE_URL",
                "\"http://$DEV_SERVER_IP:$DEV_SERVER_PORT/api/tptp-bank/\""
            )
        }
        create("prod") {
            dimension = "env"
            buildConfigField("String", "BASE_URL", "\"$PROD_API_BASE\"")
        }
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

afterEvaluate {
    tasks.findByName("assembleLocalDebug")?.let { localDebug ->
        listOf("assembleDebug", "assembleEmulatorDebug").forEach { legacyName ->
            if (tasks.findByName(legacyName) == null) {
                tasks.register(legacyName) {
                    group = "build"
                    description = "Alias → assembleLocalDebug"
                    dependsOn(localDebug)
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
