# AttendUSM - Android Studio Setup Guide

## 📱 Complete Android Setup Instructions

### Prerequisites
- **Android Studio** (latest version) - [Download here](https://developer.android.com/studio)
- **Java JDK 17** or higher
- **Android device with NFC** (API Level 24+, Android 7.0+)
- **USB cable** for device connection

---

## 🚀 Step-by-Step Setup

### 1. Open Android Studio
1. Launch Android Studio
2. Select **"Open an Existing Project"**
3. Navigate to: `F:\AttendUSM\android`
4. Click **"OK"**

### 2. Sync Gradle Files
1. Android Studio will automatically detect the project
2. Wait for **Gradle sync** to complete (bottom right corner)
3. If prompted, click **"Sync Now"**
4. Wait for dependencies to download (may take a few minutes on first run)

### 3. Connect Your Android Device

#### Enable Developer Options:
1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times
3. Go back to **Settings** → **System** → **Developer Options**
4. Enable **USB Debugging**

#### Connect Device:
1. Connect your Android device via USB cable
2. Allow USB debugging when prompted on device
3. In Android Studio, verify device appears in device selector (top toolbar)

### 4. Enable NFC on Device
1. Go to **Settings** → **Connected Devices** → **Connection Preferences**
2. Enable **NFC**
3. Ensure NFC is turned ON

### 5. Build and Run

#### Option A: Using Toolbar
1. Click the **green play button** (▶️) in the toolbar
2. Select your connected device
3. Click **"OK"**

#### Option B: Using Menu
1. Go to **Run** → **Run 'app'**
2. Select your device
3. Wait for build to complete

### 6. Grant Permissions on Device
When the app launches for the first time:
1. **Camera Permission** - Tap **"Allow"** (for QR code scanning)
2. **NFC Permission** - Should be automatically granted
3. If any permission is denied, go to:
   - **Settings** → **Apps** → **AttendUSM** → **Permissions**
   - Enable **Camera** and **NFC**

---

## 🔧 Troubleshooting

### Build Errors

#### Gradle Sync Failed
```
Solution: 
1. File → Invalidate Caches → Invalidate and Restart
2. Build → Clean Project
3. Build → Rebuild Project
```

#### SDK Not Found
```
Solution:
1. File → Project Structure → SDK Location
2. Set Android SDK location (usually C:\Users\[Username]\AppData\Local\Android\Sdk)
3. Click Apply → OK
```

#### Kotlin Plugin Error
```
Solution:
1. File → Settings → Plugins
2. Search "Kotlin"
3. Install/Update Kotlin plugin
4. Restart Android Studio
```

### Runtime Errors

#### Camera Not Working
- Check if camera permission is granted in Settings
- Ensure no other app is using the camera
- Try restarting the app

#### NFC Not Working
```
1. Verify device has NFC hardware (Settings → Connected Devices)
2. Enable NFC in device settings
3. Ensure NFC permission is granted
4. Check Chrome flags: chrome://flags/#enable-web-nfc (set to Enabled)
```

#### WebView Shows Blank Screen
```
1. Check Android Studio Logcat for errors
2. Verify all files are in assets folder
3. Try: Build → Clean Project → Rebuild Project
4. Uninstall app from device and reinstall
```

#### "Web page not available"
```
Solution:
1. Verify files exist in: android/app/src/main/assets/
2. Check file names are correct (case-sensitive)
3. Rebuild and reinstall app
```

---

## 📂 Project Structure

```
android/
├── app/
│   ├── build.gradle                    # App-level Gradle config
│   ├── src/main/
│   │   ├── AndroidManifest.xml         # Permissions & app config
│   │   ├── java/com/usm/attendance/
│   │   │   └── MainActivity.kt         # Main WebView activity
│   │   ├── res/
│   │   │   └── values/
│   │   │       ├── strings.xml         # App name
│   │   │       ├── colors.xml          # Color definitions
│   │   │       └── themes.xml          # App theme
│   │   └── assets/                     # Web app files
│   │       ├── index.html
│   │       ├── admin.html
│   │       ├── app.js
│   │       ├── db.js
│   │       ├── login.js
│   │       ├── admin.js
│   │       ├── styles.css
│   │       ├── manifest.json
│   │       └── usm_logo_Aug-2024.png
├── build.gradle                        # Project-level Gradle
├── settings.gradle                     # Gradle settings
└── gradle.properties                   # Gradle properties
```

---

## 🔑 Key Features Enabled

✅ **Camera Access** - QR code scanning
✅ **NFC Support** - NFC tag reading  
✅ **IndexedDB** - Local data storage
✅ **JavaScript** - Full web app functionality
✅ **File Access** - Loading assets from app
✅ **Internet Access** - External library loading (CDNs)

---

## 📱 Testing the App

### Test QR Code Scanning:
1. Open the app
2. Tap **"Scan QR Code"**
3. Grant camera permission if prompted
4. Point camera at a QR code with format: `FULL NAME,COURSE,,`

### Test NFC Scanning:
1. Open the app
2. Tap **"Scan NFC"**
3. Hold NFC-enabled card/tag near device back
4. App should detect and process NFC tag

### Test Admin Features:
1. Login to the app
2. Navigate to Admin section
3. Test adding students, classes, and sessions

---

## 🔄 Updating the Web App

When you make changes to HTML/CSS/JS files:

1. Copy updated files to assets folder:
```powershell
Copy-Item -Path "f:\AttendUSM\*.html", "f:\AttendUSM\*.js", "f:\AttendUSM\*.css", "f:\AttendUSM\*.png", "f:\AttendUSM\*.json" -Destination "f:\AttendUSM\android\app\src\main\assets\"
```

2. In Android Studio:
   - **Build** → **Clean Project**
   - **Build** → **Rebuild Project**
   - **Run** → **Run 'app'**

---

## 📊 Debugging

### View Logs in Android Studio:
1. Open **Logcat** (bottom toolbar)
2. Select your device
3. Filter by **"com.usm.attendance"**
4. Look for JavaScript console logs and errors

### Inspect WebView:
1. Connect device via USB
2. Open Chrome on computer
3. Navigate to: `chrome://inspect`
4. Find your device and click **"Inspect"**
5. Use Chrome DevTools to debug JavaScript

---

## 🎯 Production Build

To create a release APK:

1. **Build** → **Generate Signed Bundle / APK**
2. Select **APK**
3. Click **"Create new..."** for keystore
4. Fill in keystore details (save these securely!)
5. Click **Next** → **Finish**
6. APK will be in: `android/app/release/app-release.apk`

---

## 💡 Tips

- **First launch may be slow** - Assets need to load
- **Clear app data** if you encounter issues: Settings → Apps → AttendUSM → Storage → Clear Data
- **WebView debugging** is enabled - remove in production (MainActivity.kt line 115)
- **Keep device plugged in** during development for continuous testing

---

## 📞 Support

If you encounter issues:
1. Check **Logcat** in Android Studio
2. Enable **Chrome DevTools** inspection
3. Verify all permissions are granted
4. Try on a different Android device (NFC-enabled)

---

## ✨ Success Indicators

You'll know setup is successful when:
- ✅ App launches without errors
- ✅ Login screen appears
- ✅ Camera permission requested for QR scanning
- ✅ QR code detection works
- ✅ NFC scanning detects tags
- ✅ Data persists (IndexedDB working)

---

**Your Android app is now ready! 🎉**
