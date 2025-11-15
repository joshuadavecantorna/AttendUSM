// Login page QR/NFC functionality
(function(){
    // Wait for IndexedDB to initialize
    let dbReady = false;
    attendanceDB.init().then(() => {
        dbReady = true;
        console.log('IndexedDB initialized for login');
        checkExistingLogin();
    }).catch(error => {
        console.error('Failed to initialize IndexedDB:', error);
    });

    // Check for existing login from localStorage (for compatibility)
    async function checkExistingLogin() {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser) {
            showWelcomeScreen(currentUser);
        }
    }

    function showWelcomeScreen(currentUser) {
        authSection.style.display = 'none';
        welcomeSection.style.display = 'block';
        
        // Get current time for greeting
        const hour = new Date().getHours();
        let greeting = 'Good Evening';
        if (hour < 12) greeting = 'Good Morning';
        else if (hour < 18) greeting = 'Good Afternoon';
        
        welcomeMsg.textContent = `${greeting}, ${currentUser.name}! 👋`;
        welcomeCourse.textContent = `${currentUser.course} • Ready to track attendance`;
    }

    // Global logout function
    window.handleLogout = function() {
        localStorage.removeItem('currentUser');
        window.location.reload();
    };

    // Show attendance dashboard function
    window.showAttendanceDashboard = function() {
        const welcomeSection = document.getElementById('welcome-section');
        if (welcomeSection) {
            welcomeSection.style.display = 'none';
        }
        const attendanceSection = document.getElementById('attendance-section');
        if (attendanceSection) {
            attendanceSection.classList.remove('hidden');
        }
    };

    // QR Scanner Setup
    const qrModal = document.getElementById('qr-modal');
    const qrBtn = document.getElementById('qr-login-btn');
    const closeQrBtn = document.getElementById('close-qr-modal');
    const video = document.getElementById('qr-video');
    const canvas = document.getElementById('qr-canvas');
    const ctx = canvas.getContext('2d');
    let stream = null;

    async function startQrScanner() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment" } 
            });
            video.srcObject = stream;
            video.play();
            qrModal.classList.add('active');
            requestAnimationFrame(scanQRCode);
        } catch (err) {
            console.error('Error accessing camera:', err);
            alert('Could not access camera. Please ensure camera permissions are granted.');
        }
    }

    function stopQrScanner() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        video.srcObject = null;
        qrModal.classList.remove('active');
    }

    function scanQRCode() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                handleQRData(code.data);
                stopQrScanner();
                return;
            }
        }
        requestAnimationFrame(scanQRCode);
    }

    function handleQRData(data) {
        const [fullName, course] = data.split(',');
        if (fullName && course) {
            console.log('QR Login:', { fullName, course });
            const userData = {
                name: fullName,
                course: course,
                loginMethod: 'qr'
            };
            
            // Store in localStorage for compatibility
            localStorage.setItem('currentUser', JSON.stringify(userData));
            localStorage.setItem('currentUserName', fullName);
            localStorage.setItem('currentUserCourse', course);
            // Set loggedInUser for app.js compatibility (use a generic student account)
            localStorage.setItem('loggedInUser', 'student@usm.edu.ph');
            
            // Redirect to main app
            window.location.href = 'index.html';
        } else {
            alert('Invalid QR code format');
        }
    }

    // NFC Reader Setup
    const nfcModal = document.getElementById('nfc-modal');
    const nfcBtn = document.getElementById('nfc-login-btn');
    const closeNfcBtn = document.getElementById('close-nfc-modal');
    const nfcStatus = document.getElementById('nfc-status');
    let nfcReader = null;

    async function startNfcReader() {
        // Check if running in Android WebView with native NFC support
        if (typeof AndroidNFC !== 'undefined') {
            if (!AndroidNFC.isNFCAvailable()) {
                alert('NFC not available on this device.');
                return;
            }
            
            if (!AndroidNFC.isNFCEnabled()) {
                alert('NFC is disabled. Please enable NFC in device settings.');
                setTimeout(() => {
                    AndroidNFC.openNFCSettings();
                }, 2000);
                return;
            }
            
            // Open NFC modal and start scanning
            nfcModal.classList.add('active');
            nfcStatus.textContent = 'Ready to scan. Please tap your ID card.';
            console.log('Native NFC login scanning started');
            return;
        }
        
        // Fallback to Web NFC API
        if ('NDEFReader' in window) {
            try {
                nfcReader = new NDEFReader();
                await nfcReader.scan();
                
                nfcReader.addEventListener('reading', async (event) => {
                    // Get NFC tag serial number as ID
                    let nfcId = '';
                    if (event.serialNumber) {
                        nfcId = event.serialNumber;
                    } else {
                        // Fallback: try to read data from tag
                        try {
                            const decoder = new TextDecoder();
                            const data = decoder.decode(event.message.records[0].data);
                            nfcId = data;
                        } catch (e) {
                            console.error('Could not read NFC data:', e);
                            nfcStatus.textContent = 'Error: Could not read NFC tag.';
                            return;
                        }
                    }
                    
                    await handleNFCData(nfcId);
                });

                nfcModal.classList.add('active');
                nfcStatus.textContent = 'Ready to scan. Please tap your ID card.';
            } catch (err) {
                console.error('Error scanning NFC:', err);
                nfcStatus.textContent = 'Error: Could not access NFC. Please ensure NFC is enabled.';
            }
        } else {
            alert('NFC is not supported on this device');
            nfcModal.classList.remove('active');
        }
    }

    function stopNfcReader() {
        if (nfcReader) {
            nfcReader = null;
        }
        nfcModal.classList.remove('active');
    }

    async function handleNFCData(nfcId) {
        console.log('handleNFCData called with:', nfcId);
        
        if (!dbReady) {
            nfcStatus.textContent = 'Database not ready. Please try again.';
            console.error('Database not ready');
            return;
        }
        
        try {
            // Normalize NFC ID (remove colons, spaces, make uppercase)
            const normalizedId = nfcId.toString().replace(/[:\s-]/g, '').toUpperCase();
            console.log('Normalized NFC ID:', normalizedId);
            
            // Look up NFC tag in IndexedDB registry
            let nfcTag = await attendanceDB.getNFCTag(normalizedId);
            
            // If not found, try with original ID
            if (!nfcTag) {
                console.log('Tag not found with normalized ID, trying original:', nfcId);
                nfcTag = await attendanceDB.getNFCTag(nfcId);
            }
            
            if (nfcTag) {
                // NFC tag found in registry
                console.log('NFC Login successful:', nfcTag);
                const userData = {
                    name: nfcTag.name,
                    course: nfcTag.course,
                    loginMethod: 'nfc'
                };
                
                // Store in localStorage for compatibility
                localStorage.setItem('currentUser', JSON.stringify(userData));
                localStorage.setItem('currentUserName', userData.name);
                localStorage.setItem('currentUserCourse', userData.course);
                // Set loggedInUser for app.js compatibility
                localStorage.setItem('loggedInUser', 'student@usm.edu.ph');
                
                nfcStatus.textContent = 'Login successful! Redirecting...';
                stopNfcReader();
                
                // Small delay to show success message
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 500);
            } else {
                // NFC tag not registered
                nfcStatus.textContent = 'NFC tag not registered. Please register first in the attendance system.';
                setTimeout(() => {
                    nfcStatus.textContent = 'Ready to scan. Please tap your ID card.';
                }, 3000);
            }
        } catch (error) {
            console.error('Error handling NFC data:', error);
            nfcStatus.textContent = 'Error processing NFC tag. Please try again.';
            setTimeout(() => {
                nfcStatus.textContent = 'Ready to scan. Please tap your ID card.';
            }, 3000);
        }
    }

    // Event Listeners
    qrBtn.addEventListener('click', startQrScanner);
    closeQrBtn.addEventListener('click', stopQrScanner);
    nfcBtn.addEventListener('click', startNfcReader);
    closeNfcBtn.addEventListener('click', stopNfcReader);
    
    // Password toggle
    const toggle = document.getElementById('toggle-password');
    const pw = document.getElementById('login-password');
    if(toggle && pw){
        toggle.addEventListener('click', function(){
            if(pw.type === 'password'){ 
                pw.type = 'text'; 
                toggle.textContent = 'Hide'; 
                toggle.setAttribute('aria-label','Hide password'); 
            } else { 
                pw.type = 'password'; 
                toggle.textContent = 'Show'; 
                toggle.setAttribute('aria-label','Show password'); 
            }
        });
    }
    
    // Global handler for native Android NFC login
    // This will be called AFTER app.js loads, so it will override the attendance handler
    window.handleNFCTag = async function(tagId) {
        console.log('Native NFC tag detected for login:', tagId);
        console.log('NFC modal active:', nfcModal?.classList.contains('active'));
        console.log('Database ready:', dbReady);
        
        // Check if NFC modal is active on login page
        if (!nfcModal || !nfcModal.classList.contains('active')) {
            console.log('NFC modal not active - passing to app.js handler');
            // If there's an attendance scanner active, delegate to it
            if (window.processNFCScan) {
                await window.processNFCScan(tagId);
            }
            return;
        }
        
        // Update status
        if (nfcStatus) {
            nfcStatus.textContent = 'NFC tag detected. Processing...';
        }
        
        try {
            await handleNFCData(tagId);
        } catch (error) {
            console.error('Error in handleNFCTag:', error);
            if (nfcStatus) {
                nfcStatus.textContent = 'Error: ' + error.message;
            }
        }
    };
    
    console.log('NFC login handler installed');
})();
