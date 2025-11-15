package com.usm.attendance

import android.Manifest
import android.app.Dialog
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.ViewGroup
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import java.io.File
import java.io.OutputStream
import java.util.*

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var popupDialog: Dialog? = null
    private val permissionRequestCode = 100
    private var nfcAdapter: NfcAdapter? = null
    private var pendingIntent: PendingIntent? = null
    private var intentFiltersArray: Array<IntentFilter>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Request permissions
        requestPermissions()

        // Initialize NFC
        nfcAdapter = NfcAdapter.getDefaultAdapter(this)

        // Create WebView
        webView = WebView(this)
        setContentView(webView)

        // Configure WebView
        setupWebView()

        // Setup NFC
        setupNFC()

        // Load the app
        webView.loadUrl("file:///android_asset/index.html")

        // Handle the intent that started the activity
        intent?.let { handleNfcIntent(it) }
    }

    private fun setupWebView() {
        // Configure the main WebView
        configureWebViewSettings(webView, isPopup = false)

        // Set WebViewClient to handle navigation for the main WebView
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url.toString()
                if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://")) {
                    // Let the WebView handle http, https and file links
                    return false
                }

                // For other schemes (tel, mailto, etc.), try to launch an external activity.
                return try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                    true
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Unsupported link: $url", Toast.LENGTH_SHORT).show()
                    true // Mark as handled.
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                Toast.makeText(
                    this@MainActivity,
                    "Error loading page: ${error?.description}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

        // Set WebChromeClient for popups, camera, and permissions
        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message
            ): Boolean {
                val newWebView = WebView(this@MainActivity)
                configureWebViewSettings(newWebView, isPopup = true)

                // Create and show a dialog to host the popup WebView
                popupDialog = Dialog(this@MainActivity, android.R.style.Theme_DeviceDefault_Light_NoActionBar).apply {
                    setContentView(newWebView)
                    setOnDismissListener {
                        (newWebView.parent as? ViewGroup)?.removeView(newWebView)
                        newWebView.destroy()
                        popupDialog = null
                        // Flush cookies to ensure they are synced from the popup's webview
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            CookieManager.getInstance().flush()
                        }
                    }
                    show()
                }

                val transport = resultMsg.obj as WebView.WebViewTransport
                transport.webView = newWebView
                resultMsg.sendToTarget()
                return true
            }

            override fun onCloseWindow(window: WebView?) {
                super.onCloseWindow(window)
                popupDialog?.dismiss()
            }

            // Handle camera permission for QR scanning
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.let {
                    if (it.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                        if (checkCameraPermission()) {
                            it.grant(it.resources)
                        } else {
                            requestCameraPermission()
                            it.deny()
                        }
                    } else {
                        it.grant(it.resources)
                    }
                }
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                consoleMessage?.apply {
                    android.util.Log.d("WebView", "${message()} -- From line ${lineNumber()} of ${sourceId()}")
                }
                return true
            }
        }

        // Add JavaScript interface for NFC and file downloads
        webView.addJavascriptInterface(NFCInterface(), "AndroidNFC")
        webView.addJavascriptInterface(WebAppInterface(), "Android")
    }

    private fun configureWebViewSettings(aWebView: WebView, isPopup: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(aWebView, true)
        }

        aWebView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            @Suppress("DEPRECATION")
            databasePath = applicationContext.getDir("databases", MODE_PRIVATE).path
            allowFileAccess = true
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // Use the same user agent for consistency
            userAgentString = webView.settings.userAgentString
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)
        }

        if (isPopup) {
            aWebView.webViewClient = object : WebViewClient() {
                private fun handleUrl(url: String): Boolean {
                    // Heuristic: If the login flow is done, it redirects back to the app's local assets.
                    if (url.startsWith("file:///android_asset/")) {
                        this@MainActivity.webView.loadUrl(url)
                        popupDialog?.dismiss()
                        return true // We've handled the navigation
                    }
                    // For standard web links, let the popup handle its own navigation (e.g., on the IdP's domain)
                    if (url.startsWith("http://") || url.startsWith("https://")) {
                        return false
                    }
                    // For other schemes, try to launch an external activity.
                    return try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        popupDialog?.dismiss() // Close the popup as we are leaving the app
                        true
                    } catch (e: Exception) {
                        Toast.makeText(this@MainActivity, "Unsupported link in popup: $url", Toast.LENGTH_SHORT).show()
                        true
                    }
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return handleUrl(request.url.toString())
                }

                @Deprecated("Deprecated in Java")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                    return handleUrl(url)
                }
            }
        }

        WebView.setWebContentsDebuggingEnabled(true)
    }

    private fun setupNFC() {
        if (nfcAdapter == null) {
            Toast.makeText(this, "NFC is not available on this device", Toast.LENGTH_LONG).show()
            return
        }

        if (!nfcAdapter!!.isEnabled) {
            Toast.makeText(this, "Please enable NFC in device settings", Toast.LENGTH_LONG).show()
        }

        val intent = Intent(this, javaClass).apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_MUTABLE
        )

        val tagDetected = IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED)
        val ndefDetected = IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED)
        val techDetected = IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED)
        intentFiltersArray = arrayOf(tagDetected, ndefDetected, techDetected)
    }

    override fun onResume() {
        super.onResume()
        nfcAdapter?.enableForegroundDispatch(this, pendingIntent, intentFiltersArray, null)
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNfcIntent(intent)
    }

    private fun handleNfcIntent(intent: Intent) {
        val action = intent.action
        android.util.Log.d("NFC_DEBUG", "handleNfcIntent called with action: $action")
        
        if (action in listOf(NfcAdapter.ACTION_TAG_DISCOVERED, NfcAdapter.ACTION_NDEF_DISCOVERED, NfcAdapter.ACTION_TECH_DISCOVERED)) {
            val tag: Tag? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                IntentCompat.getParcelableExtra(intent, NfcAdapter.EXTRA_TAG, Tag::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
            }

            tag?.let {
                val tagId = bytesToHex(it.id)
                android.util.Log.d("NFC_DEBUG", "NFC tag detected with ID: $tagId")
                webView.post {
                    val jsCommand = "if(window.handleNFCTag) { window.handleNFCTag('$tagId'); } else { console.log('handleNFCTag not found'); }"
                    android.util.Log.d("NFC_DEBUG", "Executing JS: $jsCommand")
                    webView.evaluateJavascript(jsCommand, null)
                }
            } ?: android.util.Log.e("NFC_DEBUG", "Tag was null")
        } else {
            android.util.Log.d("NFC_DEBUG", "Action not matching NFC actions")
        }
    }

    private fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02X".format(it) }
    }

    inner class NFCInterface {
        @JavascriptInterface
        fun isNFCAvailable(): Boolean = nfcAdapter != null

        @JavascriptInterface
        fun isNFCEnabled(): Boolean = nfcAdapter?.isEnabled == true

        @JavascriptInterface
        fun openNFCSettings() {
            startActivity(Intent(android.provider.Settings.ACTION_NFC_SETTINGS))
        }
    }

    inner class WebAppInterface {
        @JavascriptInterface
        fun getLogoBase64(): String {
            return try {
                val inputStream = assets.open("usm_logo_Aug-2024.png")
                val bytes = inputStream.readBytes()
                inputStream.close()
                Base64.encodeToString(bytes, Base64.NO_WRAP)
            } catch (e: Exception) {
                Log.e("LOGO_ERROR", "Failed to load logo: ${e.message}")
                ""
            }
        }

        @JavascriptInterface
        fun downloadFile(content: String, fileName: String, mimeType: String) {
            Log.d("DOWNLOAD_DEBUG", "downloadFile called: fileName=$fileName, mimeType=$mimeType, contentLength=${content.length}")
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ - Use MediaStore
                val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                
                val contentValues = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }

                val resolver = applicationContext.contentResolver
                val uri = resolver.insert(collection, contentValues)
                
                Log.d("DOWNLOAD_DEBUG", "MediaStore URI: $uri")

                uri?.let {
                    try {
                        resolver.openOutputStream(it)?.use { outputStream ->
                            val bytesToWrite = if (content.startsWith("data:")) {
                                Log.d("DOWNLOAD_DEBUG", "Decoding base64 data URI")
                                Base64.decode(content.substringAfter("base64,"), Base64.DEFAULT)
                            } else if (mimeType.startsWith("text/")) {
                                Log.d("DOWNLOAD_DEBUG", "Writing as UTF-8 text")
                                content.toByteArray(Charsets.UTF_8)
                            } else {
                                Log.d("DOWNLOAD_DEBUG", "Decoding base64")
                                Base64.decode(content, Base64.DEFAULT)
                            }
                            outputStream.write(bytesToWrite)
                            outputStream.flush()
                            Log.d("DOWNLOAD_DEBUG", "Wrote ${bytesToWrite.size} bytes")
                        }
                        contentValues.clear()
                        contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
                        resolver.update(it, contentValues, null, null)
                        
                        Log.d("DOWNLOAD_DEBUG", "File saved successfully")
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "$fileName exported successfully!", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Log.e("DOWNLOAD_DEBUG", "Error saving file: ${e.message}", e)
                        resolver.delete(it, null, null)
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "Error exporting file: ${e.message}", Toast.LENGTH_LONG).show()
                        }
                    }
                } ?: run {
                    Log.e("DOWNLOAD_DEBUG", "Failed to create MediaStore URI")
                }
            } else {
                // Android 9 and below - Use legacy storage
                try {
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    val file = File(downloadsDir, fileName)
                    
                    val bytesToWrite = if (content.startsWith("data:")) {
                        Base64.decode(content.substringAfter("base64,"), Base64.DEFAULT)
                    } else if (mimeType.startsWith("text/")) {
                        content.toByteArray(Charsets.UTF_8)
                    } else {
                        Base64.decode(content, Base64.DEFAULT)
                    }
                    
                    file.writeBytes(bytesToWrite)
                    
                    // Notify media scanner
                    val uri = Uri.fromFile(file)
                    val mediaScanIntent = Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, uri)
                    sendBroadcast(mediaScanIntent)
                    
                    Log.d("DOWNLOAD_DEBUG", "File saved to: ${file.absolutePath}")
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "$fileName exported successfully!", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    Log.e("DOWNLOAD_DEBUG", "Error saving file (legacy): ${e.message}", e)
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "Error exporting file: ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    private fun requestPermissions() {
        val permissions = mutableListOf(Manifest.permission.CAMERA, Manifest.permission.NFC, Manifest.permission.INTERNET)
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }

        val permissionsToRequest = permissions.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissionsToRequest.toTypedArray(), permissionRequestCode)
        }
    }

    private fun checkCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestCameraPermission() {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), permissionRequestCode)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == permissionRequestCode) {
            if (grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                Toast.makeText(this, "All permissions granted", Toast.LENGTH_SHORT).show()
                webView.reload()
            } else {
                Toast.makeText(this, "Some permissions were denied. App may not work correctly.", Toast.LENGTH_LONG).show()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        popupDialog?.dismiss() // Ensure the dialog is dismissed to avoid leaks
        webView.destroy()
        super.onDestroy()
    }
}
