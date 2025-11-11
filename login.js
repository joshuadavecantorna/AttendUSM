// Login page QR/NFC functionality
(function(){
    // Check for existing login
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser) {
        document.getElementById('auth-section').style.display = 'none';
        const welcomeSection = document.createElement('div');
        welcomeSection.id = 'welcome-section';
        welcomeSection.innerHTML = `
            <div class="card" style="text-align:center;padding:2rem;">
                <div style="width:80px;height:80px;margin:0 auto 1.5rem;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                        <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
                    </svg>
                </div>
                <h2 style="margin:0 0 0.5rem;color:var(--primary);">Welcome, ${currentUser.name}!</h2>
                <p style="margin:0 0 1.5rem;color:var(--text-light);">${currentUser.course}</p>
                <div style="max-width:300px;margin:0 auto;">
                    <button onclick="showAttendanceDashboard()" class="btn btn-primary btn-block">
                        Go to Attendance Dashboard
                    </button>
                    <button onclick="handleLogout()" class="btn btn-outline btn-block" style="margin-top:0.75rem;">
                        Sign Out
                    </button>
                </div>
            </div>
        `;
        document.querySelector('.container').appendChild(welcomeSection);
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
            localStorage.setItem('currentUser', JSON.stringify({
                name: fullName,
                course: course,
                loginMethod: 'qr'
            }));
            
            document.getElementById('auth-section').style.display = 'none';
            
            const welcomeSection = document.createElement('div');
            welcomeSection.id = 'welcome-section';
            welcomeSection.innerHTML = `
                <div class="card" style="text-align:center;padding:2rem;">
                    <div style="width:80px;height:80px;margin:0 auto 1.5rem;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                            <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
                        </svg>
                    </div>
                    <h2 style="margin:0 0 0.5rem;color:var(--primary);">Welcome, ${fullName}!</h2>
                    <p style="margin:0 0 1.5rem;color:var(--text-light);">${course}</p>
                    <div style="max-width:300px;margin:0 auto;">
                        <button onclick="showAttendanceDashboard()" class="btn btn-primary btn-block">
                            Go to Attendance Dashboard
                        </button>
                        <button onclick="handleLogout()" class="btn btn-outline btn-block" style="margin-top:0.75rem;">
                            Sign Out
                        </button>
                    </div>
                </div>
            `;
            document.querySelector('.container').appendChild(welcomeSection);
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
        if ('NDEFReader' in window) {
            try {
                nfcReader = new NDEFReader();
                await nfcReader.scan();
                
                nfcReader.addEventListener('reading', ({ message }) => {
                    const decoder = new TextDecoder();
                    const data = decoder.decode(message.records[0].data);
                    handleNFCData(data);
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

    function handleNFCData(data) {
        const [fullName, course] = data.split(',');
        if (fullName && course) {
            console.log('NFC Login:', { fullName, course });
            localStorage.setItem('currentUser', JSON.stringify({
                name: fullName,
                course: course,
                loginMethod: 'nfc'
            }));
            window.location.reload();
        } else {
            alert('Invalid NFC data format');
        }
        stopNfcReader();
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
})();
