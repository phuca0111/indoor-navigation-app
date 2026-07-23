plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.khoaluan.indoornav"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.khoaluan.indoornav"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    flavorDimensions += "env"
    productFlavors {
        create("local") {
            dimension = "env"
            // Bản test nội bộ: điện thoại gọi backend đang chạy trên laptop.
            buildConfigField("String", "BASE_URL", "\"http://192.168.2.21:5000/api/\"")
            // W8 — cùng Web Client ID với Backend_server/.env (GOOGLE_CLIENT_ID)
            buildConfigField(
                "String",
                "GOOGLE_WEB_CLIENT_ID",
                "\"755439038142-ifki16317vj5j7qi0erfloa92vq481f8.apps.googleusercontent.com\""
            )
        }

        create("prod") {
            dimension = "env"
            // Bản gửi người khác dùng: gọi backend Render online.
            buildConfigField("String", "BASE_URL", "\"https://indoor-navigation-app-sqiu.onrender.com/api/\"")
            buildConfigField(
                "String",
                "GOOGLE_WEB_CLIENT_ID",
                "\"755439038142-ifki16317vj5j7qi0erfloa92vq481f8.apps.googleusercontent.com\""
            )
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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

    // Networking & Dữ liệu
    implementation(libs.retrofit)
    implementation(libs.converter.gson)
    implementation(libs.coil.compose)
    implementation(libs.okhttp.logging.interceptor) // Issue 25: logging interceptor

    // CameraX
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.guava)

    // ML Kit Barcode
    implementation(libs.com.google.mlkit.barcode.scanning)

    // W8 Google Sign-In
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)

    // Outdoor discovery map (OSM tiles — không cần Google Maps API key)
    implementation(libs.osmdroid.android)

    testImplementation(libs.junit)
    testImplementation(libs.mockito.core)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.robolectric)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}