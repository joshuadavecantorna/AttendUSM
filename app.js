document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showLoginLink = document.getElementById('show-login');
    const showRegisterLink = document.getElementById('show-register');
    const authSection = document.getElementById('auth-section');
    const attendanceSection = document.getElementById('attendance-section');
    const sessionSettings = document.getElementById('session-settings');
    const attendanceCapture = document.getElementById('attendance-capture');
    const attendanceDisplay = document.getElementById('attendance-display');
    const logoutBtn = document.getElementById('logout-btn');
    const startSessionBtn = document.getElementById('start-session-btn');
    const scanQrBtn = document.getElementById('scan-qr-btn');
    const scanNfcBtn = document.getElementById('scan-nfc-btn');
    const exportExcelBtn = document.getElementById('export-excel-btn');
    const exportSubjectSelect = document.getElementById('export-subject-select');
    const qrVideo = document.getElementById('qr-video-attendance');
    const qrCanvas = document.getElementById('qr-canvas-attendance');
    const qrScannerContainer = document.getElementById('qr-scanner');
    const qrCanvasContext = qrCanvas.getContext('2d');
    const studentList = document.getElementById('student-list');
    const presentCountDisplay = document.getElementById('present-count');
    const lateCountDisplay = document.getElementById('late-count');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    // Initialize default admin account if none exists
    if (!localStorage.getItem('user_admin@usm.edu.ph')) {
        const hashedPassword = btoa(encodeURIComponent('admin123'));
        localStorage.setItem('user_admin@usm.edu.ph', JSON.stringify({ 
            password: hashedPassword 
        }));
    }

    // --- State Variables ---
    let loggedInUser = localStorage.getItem('loggedInUser');
    let studentsDB = [];
    let currentCourse = null;
    let currentSemester = null;
    let classStartTime = null;
    let currentClassTimeStr = null;
    let currentSessionId = null;
    let attendanceDataForCurrentSession = [];
    let qrScanningActive = false;
    const recentScanCache = new Map();

    // --- Local Storage Helper Functions ---
    function loadStudentsDB() {
        try {
            if (!loggedInUser) return [];
            const stored = localStorage.getItem(`allStudents_${loggedInUser}`);
            const parsed = stored ? JSON.parse(stored) : [];
            return parsed.map(student => ({
                ...student,
                attendanceHistory: (student.attendanceHistory || []).map(record => {
                    if (typeof record.isLate !== 'undefined') {
                        return {
                            sessionId: record.sessionId,
                            status: record.isLate ? 'Late' : 'Present',
                            course: record.course,
                            semester: record.semester,
                            classTime: record.classTime,
                            timestamp: record.timestamp || new Date().toISOString()
                        };
                    }
                    return record;
                })
            }));
        } catch (e) {
            console.error("Error loading studentsDB:", e);
            return [];
        }
    }

    function saveStudentsDB() {
        try {
            if (!loggedInUser) return;
            localStorage.setItem(`allStudents_${loggedInUser}`, JSON.stringify(studentsDB));
        } catch (e) {
            console.error("Error saving studentsDB:", e);
        }
    }

    // --- UI State Management Functions ---
    if (loggedInUser) {
        studentsDB = loadStudentsDB();
        showAttendanceSection();
        updateExportSubjectOptions();
    } else {
        showAuthSection();
    }

    function showAttendanceSection() {
        authSection.classList.add('hidden');
        attendanceSection.classList.remove('hidden');
        sessionSettings.classList.remove('hidden');
        attendanceCapture.classList.add('hidden');
        attendanceDisplay.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
    }

    function showAuthSection() {
        authSection.classList.remove('hidden');
        attendanceSection.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        loginError.style.display = 'none';
        registerError.style.display = 'none';
    }

    function updateStatusCounters() {
        const presentCount = attendanceDataForCurrentSession.filter(s => s.status === 'Present').length;
        const lateCount = attendanceDataForCurrentSession.filter(s => s.status === 'Late').length;
        presentCountDisplay.textContent = presentCount;
        lateCountDisplay.textContent = lateCount;
        
        // Update total count and attendance rate
        const totalCountDisplay = document.getElementById('total-count');
        const attendanceRateDisplay = document.getElementById('attendance-rate');
        if (totalCountDisplay) totalCountDisplay.textContent = attendanceDataForCurrentSession.length;
        if (attendanceRateDisplay && studentsDB.length > 0) {
            const rate = Math.round((attendanceDataForCurrentSession.length / studentsDB.length) * 100);
            attendanceRateDisplay.textContent = rate + '%';
        }
    }

    function refreshStudentListUI() {
        studentList.innerHTML = '';

        if (attendanceDataForCurrentSession.length === 0) {
            studentList.innerHTML = '<li class="student-item">No attendance records yet</li>';
        } else {
            attendanceDataForCurrentSession.sort((a, b) => a.name.localeCompare(b.name));

            attendanceDataForCurrentSession.forEach(sessionRecord => {
                const student = studentsDB.find(s => s.id === sessionRecord.id);
                if (student) {
                    const li = document.createElement('li');
                    li.className = 'student-item';
                    li.innerHTML = `
                        <div class="student-info">
                            <div class="student-name">${student.name}</div>
                            <div class="student-program">${student.program}</div>
                        </div>
                        <span class="status-badge status-${sessionRecord.status.toLowerCase()}">${sessionRecord.status}</span>
                    `;
                    studentList.appendChild(li);
                }
            });
        }
        updateStatusCounters();
    }
    
    function updateExportSubjectOptions() {
        // Get all unique courses from attendance history
        const courses = new Set();
        studentsDB.forEach(student => {
            student.attendanceHistory.forEach(record => {
                if (record.course) {
                    courses.add(`${record.course} - ${record.semester}`);
                }
            });
        });
        
        // Clear existing options except the first two
        while (exportSubjectSelect.options.length > 2) {
            exportSubjectSelect.remove(2);
        }
        
        // Add options for each course
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course;
            option.textContent = course;
            exportSubjectSelect.appendChild(option);
        });
    }

    // --- Authentication Functions ---
    function handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        
        // Check for admin credentials
        if (username === 'admin@gmail.com' && password === 'admin') {
            loggedInUser = username;
            localStorage.setItem('loggedInUser', loggedInUser);
            // Redirect to admin page
            window.location.href = 'admin.html';
            return;
        }
        
        const userData = localStorage.getItem(`user_${username}`);

        if (!userData) {
            loginError.style.display = 'block';
            return;
        }
        
        const user = JSON.parse(userData);
        const hashedInput = btoa(encodeURIComponent(password));
        
        if (user.password !== hashedInput) {
            loginError.style.display = 'block';
            return;
        }
        
        loggedInUser = username;
        localStorage.setItem('loggedInUser', loggedInUser);
        studentsDB = loadStudentsDB();
        showAttendanceSection();
        updateExportSubjectOptions();
        document.getElementById('login-form').reset();
        loginError.style.display = 'none';
    }

    function handleRegister() {
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value.trim();

        if (!username || !password) {
            alert('Please enter both email and password.');
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
            alert('Please enter a valid email address.');
            return;
        }

        if (localStorage.getItem(`user_${username}`)) {
            registerError.style.display = 'block';
            return;
        }

        const hashedPassword = btoa(encodeURIComponent(password));
        localStorage.setItem(`user_${username}`, JSON.stringify({ password: hashedPassword }));
        
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        registerForm.reset();
        registerError.style.display = 'none';
        alert('Registered successfully. Please log in.');
    }

    // --- QR Code Scanner Functions ---
    function startQrScanner() {
        qrScannerContainer.classList.remove('hidden');
        qrVideo.style.display = 'block';
        // Canvas should remain hidden - it's only used for processing, not display
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                qrVideo.srcObject = stream;
                qrVideo.setAttribute('playsinline', true);
                qrVideo.play();
                requestAnimationFrame(tick);
            })
            .catch(err => {
                alert('Camera access error: ' + err.message);
                console.error('Camera error:', err);
                stopQrScanner();
            });
    }

    function tick() {
        if (!qrScanningActive) return;

        if (qrVideo.readyState === qrVideo.HAVE_ENOUGH_DATA) {
            qrCanvas.height = qrVideo.videoHeight;
            qrCanvas.width = qrVideo.videoWidth;
            qrCanvasContext.drawImage(qrVideo, 0, 0, qrCanvas.width, qrCanvas.height);
            const imageData = qrCanvasContext.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            
            if (code) {
                const scannedId = code.data.trim();
                if (scannedId) {
                    // Throttle repeat scans of the same QR code
                    const now = Date.now();
                    const lastScan = recentScanCache.get(scannedId);
                    if (!lastScan || (now - lastScan) > 3000) {
                        recentScanCache.set(scannedId, now);
                        processScannedId(scannedId);
                        // Auto-clear from cache after 3 seconds
                        setTimeout(() => recentScanCache.delete(scannedId), 3000);
                    }
                }
            }
        }
        requestAnimationFrame(tick);
    }

    function stopQrScanner() {
        qrScanningActive = false;
        qrVideo.pause();
        if (qrVideo.srcObject) {
            qrVideo.srcObject.getTracks().forEach(track => track.stop());
        }
        qrVideo.srcObject = null;
        qrVideo.style.display = 'none';
        qrCanvas.style.display = 'none';
        qrScannerContainer.classList.add('hidden');
        recentScanCache.clear();
        scanQrBtn.classList.remove('scanning-active');
        scanQrBtn.innerHTML = `
            <svg style="width: 20px; height: 20px; margin-right: 8px; vertical-align: text-bottom;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3z"/>
                <path d="M15 15h6v6h-6zM7 7h2v2H7zM19 7h2v2h-2zM7 19h2v2H7z"/>
            </svg>
            Scan QR Code
        `;
    }

    // --- NFC Scanning Functionality ---
    let pendingNFCRegistration = null;
    
    // Load NFC registry from localStorage
    function loadNFCRegistry() {
        try {
            const registry = localStorage.getItem('nfcRegistry');
            return registry ? JSON.parse(registry) : {};
        } catch (e) {
            console.error('Error loading NFC registry:', e);
            return {};
        }
    }
    
    // Save NFC registry to localStorage
    function saveNFCRegistry(registry) {
        try {
            localStorage.setItem('nfcRegistry', JSON.stringify(registry));
        } catch (e) {
            console.error('Error saving NFC registry:', e);
        }
    }
    
    // Register NFC tag with student data
    function registerNFCTag(nfcId, studentName, studentCourse) {
        const registry = loadNFCRegistry();
        const studentId = studentName.replace(/\s+/g, '_').toUpperCase();
        
        // Check if NFC tag already registered
        if (registry[nfcId]) {
            showScanWarningAnimation(registry[nfcId].name, 'NFC tag already registered to this student');
            return false;
        }
        
        // Register the NFC tag
        registry[nfcId] = {
            studentId: studentId,
            name: studentName,
            course: studentCourse,
            registeredAt: new Date().toISOString()
        };
        
        saveNFCRegistry(registry);
        showScanSuccessAnimation(studentName, 'NFC Tag Registered');
        return true;
    }
    
    // Process NFC scan for attendance
    function processNFCScan(nfcId) {
        const registry = loadNFCRegistry();
        const studentData = registry[nfcId];
        
        if (!studentData) {
            // NFC tag not registered - prompt for QR registration
            pendingNFCRegistration = nfcId;
            showNfcError('NFC tag not registered. Opening QR scanner to register...');
            
            // Automatically open QR scanner for registration
            setTimeout(() => {
                closeNfcDialog(); // Close NFC dialog first
                if (!qrScanningActive) {
                    qrScanningActive = true;
                    scanQrBtn.classList.add('scanning-active');
                    scanQrBtn.innerHTML = `
                        <svg style="width: 20px; height: 20px; margin-right: 8px; vertical-align: text-bottom;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                        </svg>
                        Stop Scanning
                    `;
                    startQrScanner();
                }
            }, 3000); // Wait 3 seconds for user to read the message
            return;
        }
        
        // NFC tag is registered - check if session is active
        if (!currentSessionId) {
            showNfcWarning(studentData.name, 'NFC tag registered. Please start a session to mark attendance.');
            return;
        }
        
        // NFC tag registered and session active - process attendance
        const studentId = studentData.studentId;
        
        // Check if already scanned in this session
        const existingRecord = attendanceDataForCurrentSession.find(rec => rec.id === studentId);
        if (existingRecord) {
            showNfcWarning(studentData.name, `Already marked as ${existingRecord.status} for this session`);
            return;
        }
        
        // Process attendance
        const currentTime = new Date();
        const lateThresholdMinutes = 15;
        const lateTime = new Date(classStartTime.getTime() + lateThresholdMinutes * 60 * 1000);
        const determinedStatus = currentTime > lateTime ? 'Late' : 'Present';
        
        let student = studentsDB.find(s => s.id === studentId);
        
        if (!student) {
            // Create student if doesn't exist
            student = {
                id: studentId,
                name: studentData.name,
                program: studentData.course,
                presentCount: 0,
                lateCount: 0,
                attendanceHistory: []
            };
            studentsDB.push(student);
        }
        
        // Update counts
        if (determinedStatus === 'Late') {
            student.lateCount = (student.lateCount || 0) + 1;
        } else {
            student.presentCount = (student.presentCount || 0) + 1;
        }
        
        // Add attendance record
        student.attendanceHistory.push({
            sessionId: currentSessionId,
            status: determinedStatus,
            course: currentCourse,
            semester: currentSemester,
            classTime: currentClassTimeStr,
            timestamp: new Date().toISOString()
        });
        
        // Add to current session display
        attendanceDataForCurrentSession.push({
            id: student.id,
            name: student.name,
            program: student.program,
            status: determinedStatus
        });
        
        saveStudentsDB();
        refreshStudentListUI();
        updateExportSubjectOptions();
        showNfcSuccess(student.name, determinedStatus);
    }

    // NFC Dialog Box Management
    let nfcReader = null;
    let nfcScanCount = 0;
    let isNfcScanning = false;

    function openNfcDialog() {
        const dialog = document.getElementById('nfc-scan-dialog');
        dialog.style.display = 'block';
        nfcScanCount = 0;
        updateNfcScanCount();
        showNfcScanning();
    }

    function closeNfcDialog() {
        const dialog = document.getElementById('nfc-scan-dialog');
        dialog.style.display = 'none';
        stopNfcScan();
    }

    function updateNfcScanCount() {
        const countElement = document.getElementById('nfc-scan-count');
        if (countElement) {
            countElement.textContent = nfcScanCount;
        }
    }

    function hideAllNfcMessages() {
        document.getElementById('nfc-scanning-animation').style.display = 'none';
        document.getElementById('nfc-success-message').style.display = 'none';
        document.getElementById('nfc-error-message').style.display = 'none';
        document.getElementById('nfc-warning-message').style.display = 'none';
    }

    function showNfcScanning() {
        hideAllNfcMessages();
        document.getElementById('nfc-scanning-animation').style.display = 'block';
    }

    function showNfcSuccess(name, status) {
        hideAllNfcMessages();
        document.getElementById('nfc-success-name').textContent = name;
        document.getElementById('nfc-success-status').textContent = status;
        document.getElementById('nfc-success-message').style.display = 'block';
        
        // Return to scanning after 2 seconds
        setTimeout(() => {
            if (isNfcScanning) {
                showNfcScanning();
            }
        }, 2000);
    }

    function showNfcError(message) {
        hideAllNfcMessages();
        document.getElementById('nfc-error-text').textContent = message;
        document.getElementById('nfc-error-message').style.display = 'block';
        
        // Return to scanning after 3 seconds
        setTimeout(() => {
            if (isNfcScanning) {
                showNfcScanning();
            }
        }, 3000);
    }

    function showNfcWarning(name, message) {
        hideAllNfcMessages();
        document.getElementById('nfc-warning-name').textContent = name;
        document.getElementById('nfc-warning-text').textContent = message;
        document.getElementById('nfc-warning-message').style.display = 'block';
        
        // Return to scanning after 2.5 seconds
        setTimeout(() => {
            if (isNfcScanning) {
                showNfcScanning();
            }
        }, 2500);
    }

    function startNfcScan() {
        if (!('NDEFReader' in window)) {
            showPermissionModal('NFC not supported on this device. Please use a device with NFC capability.', 'error');
            return;
        }

        // Open the NFC dialog
        openNfcDialog();
        isNfcScanning = true;

        nfcReader = new NDEFReader();
        nfcReader.scan().then(() => {
            console.log('NFC scan started successfully');
            
            nfcReader.onreadingerror = () => {
                showNfcError('NFC read error. Please try again.');
            };
            
            nfcReader.onreading = event => {
                let nfcId = '';
                
                // Try to get NFC tag ID
                if (event.serialNumber) {
                    nfcId = event.serialNumber;
                } else {
                    // Generate unique ID from tag UID or timestamp
                    nfcId = 'NFC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                }
                
                console.log('NFC tag detected:', nfcId);
                
                if (nfcId) {
                    nfcScanCount++;
                    updateNfcScanCount();
                    processNFCScan(nfcId);
                } else {
                    showNfcError('Could not read NFC tag ID.');
                }
            };
        }).catch(error => {
            console.error('NFC scan error:', error);
            showNfcError('NFC error: ' + error.message);
            isNfcScanning = false;
        });
    }
    
    function stopNfcScan() {
        isNfcScanning = false;
        if (nfcReader) {
            nfcReader.onreading = null;
            nfcReader.onreadingerror = null;
            nfcReader = null;
        }
        console.log('NFC scanning stopped');
    }

    // --- Core ID Processing Logic ---
    function processScannedId(scannedData) {
        // Parse QR code format: "FULL NAME,COURSE,,"
        const parts = scannedData.split(',');
        if (parts.length < 2) {
            showPermissionModal('Invalid QR code format. Expected: "FULL NAME,COURSE,,"', 'error');
            return;
        }

        const studentName = parts[0].trim();
        const studentCourse = parts[1].trim();
        
        if (!studentName || !studentCourse) {
            showPermissionModal('Invalid QR code data. Name and course are required.', 'error');
            return;
        }

        // Check if this is for NFC registration
        if (pendingNFCRegistration) {
            const nfcId = pendingNFCRegistration;
            pendingNFCRegistration = null;
            registerNFCTag(nfcId, studentName, studentCourse);
            return;
        }

        // Regular QR attendance processing
        if (!currentSessionId) {
            showPermissionModal('Session not started. Please set course, semester, and class time.', 'error');
            return;
        }

        // Generate unique ID from name
        const id = studentName.replace(/\s+/g, '_').toUpperCase();

        // Check if already scanned in this session
        const existingRecord = attendanceDataForCurrentSession.find(rec => rec.id === id);
        if (existingRecord) {
            showScanWarningAnimation(existingRecord.name, `Already marked as ${existingRecord.status} for this session`);
            return;
        }

        const currentTime = new Date();
        const lateThresholdMinutes = 15;
        const lateTime = new Date(classStartTime.getTime() + lateThresholdMinutes * 60 * 1000);
        const determinedStatus = currentTime > lateTime ? 'Late' : 'Present';

        let student = studentsDB.find(s => s.id === id);

        if (student) {
            // Update counts
            if (determinedStatus === 'Late') {
                student.lateCount = (student.lateCount || 0) + 1;
            } else {
                student.presentCount = (student.presentCount || 0) + 1;
            }

            // Add attendance record
            student.attendanceHistory.push({
                sessionId: currentSessionId,
                status: determinedStatus,
                course: currentCourse,
                semester: currentSemester,
                classTime: currentClassTimeStr,
                timestamp: new Date().toISOString()
            });

            // Add to current session display
            attendanceDataForCurrentSession.push({
                id: student.id,
                name: student.name,
                program: student.program,
                status: determinedStatus
            });

            saveStudentsDB();
            refreshStudentListUI();
            updateExportSubjectOptions();
            showScanSuccessAnimation(student.name, determinedStatus);
        } else {
            // Automatically create new student from QR data
            const newStudent = {
                id: id,
                name: studentName,
                program: studentCourse,
                presentCount: determinedStatus === 'Present' ? 1 : 0,
                lateCount: determinedStatus === 'Late' ? 1 : 0,
                attendanceHistory: [{
                    sessionId: currentSessionId,
                    status: determinedStatus,
                    course: currentCourse,
                    semester: currentSemester,
                    classTime: currentClassTimeStr,
                    timestamp: new Date().toISOString()
                }]
            };

            studentsDB.push(newStudent);

            // Add to current session display
            attendanceDataForCurrentSession.push({
                id: newStudent.id,
                name: newStudent.name,
                program: newStudent.program,
                status: determinedStatus
            });

            saveStudentsDB();
            refreshStudentListUI();
            updateExportSubjectOptions();
            showScanSuccessAnimation(newStudent.name, determinedStatus);
        }
    }

    function showScanSuccessAnimation(studentName, status) {
        const overlay = document.getElementById('scan-success-overlay');
        const nameDisplay = document.getElementById('success-student-name');
        const statusDisplay = document.getElementById('success-status');
        
        // Update text content
        nameDisplay.textContent = studentName;
        statusDisplay.textContent = `Marked as ${status}`;
        
        // Show overlay with animation
        overlay.style.display = 'flex';
        overlay.classList.add('show');
        
        // Hide after animation
        setTimeout(() => {
            overlay.classList.remove('show');
            overlay.classList.add('hide');
            
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.classList.remove('hide');
            }, 300); // Match fade-out animation duration
        }, 1500); // Show for 1.5 seconds
    }

    function showScanErrorAnimation(message) {
        const overlay = document.getElementById('scan-error-overlay');
        const errorMessage = document.getElementById('error-message');
        
        // Update message
        errorMessage.textContent = message;
        
        // Show overlay with animation
        overlay.style.display = 'flex';
        overlay.classList.add('show');
        
        // Add shake effect
        setTimeout(() => {
            overlay.classList.add('shake');
        }, 400);
        
        // Hide after animation
        setTimeout(() => {
            overlay.classList.remove('show', 'shake');
            overlay.classList.add('hide');
            
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.classList.remove('hide');
            }, 300);
        }, 2000);
    }

    function showScanWarningAnimation(studentName, message) {
        const overlay = document.getElementById('scan-warning-overlay');
        const nameDisplay = document.getElementById('warning-student-name');
        const warningMessage = document.getElementById('warning-message');
        
        // Update content
        nameDisplay.textContent = studentName;
        warningMessage.textContent = message;
        
        // Show overlay with animation
        overlay.style.display = 'flex';
        overlay.classList.add('show');
        
        // Hide after animation
        setTimeout(() => {
            overlay.classList.remove('show');
            overlay.classList.add('hide');
            
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.classList.remove('hide');
            }, 300);
        }, 2000);
    }

    function showPermissionModal(message, type) {
        if (type === 'error') {
            // Use error animation instead of alert
            showScanErrorAnimation(message);
        }
        // Removed alerts for 'info' type messages
    }

    // --- Event Listeners ---
    showLoginLink.addEventListener('click', e => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        registerError.style.display = 'none';
    });

    showRegisterLink.addEventListener('click', e => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        loginError.style.display = 'none';
    });

    loginBtn.addEventListener('click', e => {
        e.preventDefault();
        handleLogin();
    });

    registerBtn.addEventListener('click', e => {
        e.preventDefault();
        handleRegister();
    });

    // Allow form submission with Enter key
    document.getElementById('login-username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });

    document.getElementById('login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('loggedInUser');
        loggedInUser = null;
        currentCourse = null;
        currentSemester = null;
        classStartTime = null;
        currentClassTimeStr = null;
        currentSessionId = null;
        attendanceDataForCurrentSession = [];
        showAuthSection();
        stopQrScanner();
    });

    startSessionBtn.addEventListener('click', () => {
        const courseInput = document.getElementById('course').value.trim();
        const semesterInput = document.getElementById('semester').value;
        const timeInput = document.getElementById('class-time').value;

        if (!courseInput || !semesterInput || !timeInput) {
            showPermissionModal('Please fill all session details to start.', 'error');
            return;
        }

        currentCourse = courseInput;
        currentSemester = semesterInput;
        currentClassTimeStr = timeInput;

        const now = new Date();
        const [hours, minutes] = timeInput.split(':').map(Number);
        classStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

        currentSessionId = `${currentCourse.replace(/\s/g, '_')}-${currentSemester.replace(/\s/g, '_')}-${now.toISOString().slice(0, 10)}-${timeInput.replace(':', '')}`;

        attendanceDataForCurrentSession = [];
        studentsDB.forEach(student => {
            const sessionRecord = student.attendanceHistory.find(
                record => record.sessionId === currentSessionId
            );
            if (sessionRecord) {
                attendanceDataForCurrentSession.push({
                    id: student.id,
                    name: student.name,
                    program: student.program,
                    status: sessionRecord.status
                });
            }
        });

        sessionSettings.classList.add('hidden');
        attendanceCapture.classList.remove('hidden');
        attendanceDisplay.classList.remove('hidden');
        updateStatusCounters();
        refreshStudentListUI();
        
        // Update session info display
        const sessionInfo = document.getElementById('current-session-info');
        if (sessionInfo) {
            sessionInfo.textContent = `${currentCourse} - ${currentSemester} at ${currentClassTimeStr}`;
        }
        
        showPermissionModal(`Session for ${currentCourse} (${currentSemester}) at ${currentClassTimeStr} started.`, 'info');
    });

    scanQrBtn.addEventListener('click', () => {
        if (!currentSessionId) {
            alert('Please start a session first before scanning.');
            return;
        }
        if (qrScanningActive) {
            stopQrScanner();
            return;
        }
        qrScanningActive = true;
        scanQrBtn.classList.add('scanning-active');
        scanQrBtn.innerHTML = `
            <svg style="width: 20px; height: 20px; margin-right: 8px; vertical-align: text-bottom;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
            </svg>
            Stop Scanning
        `;
        startQrScanner();
    });

    scanNfcBtn.addEventListener('click', () => {
        // NFC can be used without session for registration
        startNfcScan();
    });

    // Close NFC dialog button
    const closeNfcDialogBtn = document.getElementById('close-nfc-dialog');
    if (closeNfcDialogBtn) {
        closeNfcDialogBtn.addEventListener('click', () => {
            closeNfcDialog();
        });
    }

    exportExcelBtn.addEventListener('click', () => {
        if (studentsDB.length === 0) {
            alert('No student data to export.');
            return;
        }
        
        const exportOption = exportSubjectSelect.value;
        let csv = '';
        
        if (exportOption === 'current') {
            // Export current session only
            if (!currentCourse || attendanceDataForCurrentSession.length === 0) {
                alert('No attendance data for current session to export.');
                return;
            }
            
            csv = generateCurrentSessionCSV();
            const filename = `USM_Attendance_${currentCourse.replace(/\s/g, '_')}_${currentSemester.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
            downloadCSV(csv, filename);
            
        } else if (exportOption === 'all') {
            csv = generateAllSessionsCSV();
            downloadCSV(csv, `USM_Attendance_Complete_Report_${new Date().toISOString().slice(0, 10)}.csv`);
            
        } else {
            csv = generateSubjectCSV(exportOption);
            if (csv) {
                const [course, semester] = exportOption.split(' - ');
                downloadCSV(csv, `USM_Attendance_${course.replace(/\s/g, '_')}_${semester.replace(/\s/g, '_')}.csv`);
            }
        }
    });
    
    function generateCurrentSessionCSV() {
        let csv = `University of Southern Mindanao\n`;
        csv += `Attendance Report for ${currentCourse} (${currentSemester})\n`;
        csv += `Class Time: ${currentClassTimeStr}\n`;
        csv += `Report Generated: ${new Date().toLocaleString()}\n\n`;
        
        const totalStudents = studentsDB.length;
        const presentStudents = attendanceDataForCurrentSession.filter(s => s.status === 'Present').length;
        const lateStudents = attendanceDataForCurrentSession.filter(s => s.status === 'Late').length;
        const absentStudents = totalStudents - presentStudents - lateStudents;
        
        csv += `SUMMARY\n`;
        csv += `Total Students: ${totalStudents}\n`;
        csv += `Present: ${presentStudents}\n`;
        csv += `Late: ${lateStudents}\n`;
        csv += `Absent: ${absentStudents}\n\n`;
        
        csv += `DETAILED ATTENDANCE\n`;
        csv += `Student ID,Full Name,Program,Status,Timestamp\n`;
        
        attendanceDataForCurrentSession.forEach(sessionRecord => {
            const student = studentsDB.find(s => s.id === sessionRecord.id);
            if (student) {
                const record = student.attendanceHistory.find(
                    r => r.sessionId === currentSessionId
                );
                if (record) {
                    csv += `"${student.id}","${student.name}","${student.program}","${sessionRecord.status}","${record.timestamp}"\n`;
                }
            }
        });
        
        return csv;
    }
    
    function generateAllSessionsCSV() {
        let csv = `University of Southern Mindanao\n`;
        csv += `Complete Attendance Report\n`;
        csv += `Report Generated: ${new Date().toLocaleString()}\n\n`;
        
        const subjects = {};
        studentsDB.forEach(student => {
            student.attendanceHistory.forEach(record => {
                if (!record.course) return;
                
                const key = `${record.course} - ${record.semester}`;
                if (!subjects[key]) {
                    subjects[key] = {
                        students: new Set(),
                        present: 0,
                        late: 0,
                        records: []
                    };
                }
                
                subjects[key].students.add(student.id);
                if (record.status === 'Present') subjects[key].present++;
                if (record.status === 'Late') subjects[key].late++;
                subjects[key].records.push({
                    studentId: student.id,
                    name: student.name,
                    program: student.program,
                    status: record.status,
                    classTime: record.classTime,
                    timestamp: record.timestamp
                });
            });
        });
        
        for (const [subject, data] of Object.entries(subjects)) {
            const [course, semester] = subject.split(' - ');
            
            csv += `\nSUBJECT: ${course} (${semester})\n`;
            csv += `Total Students: ${data.students.size}\n`;
            csv += `Total Present: ${data.present}\n`;
            csv += `Total Late: ${data.late}\n`;
            csv += `Total Sessions: ${data.records.length}\n\n`;
            
            csv += `Student ID,Full Name,Program,Status,Class Time,Timestamp\n`;
            data.records.forEach(record => {
                csv += `"${record.studentId}","${record.name}","${record.program}","${record.status}","${record.classTime}","${record.timestamp}"\n`;
            });
        }
        
        return csv;
    }
    
    function generateSubjectCSV(exportOption) {
        const [course, semester] = exportOption.split(' - ');
        
        const subjectRecords = [];
        const subjectStudents = new Set();
        let subjectPresent = 0;
        let subjectLate = 0;
        
        studentsDB.forEach(student => {
            student.attendanceHistory
                .filter(record => record.course === course && record.semester === semester)
                .forEach(record => {
                    subjectStudents.add(student.id);
                    if (record.status === 'Present') subjectPresent++;
                    if (record.status === 'Late') subjectLate++;
                    subjectRecords.push({
                        studentId: student.id,
                        name: student.name,
                        program: student.program,
                        status: record.status,
                        classTime: record.classTime,
                        timestamp: record.timestamp,
                        presentCount: student.presentCount || 0,
                        lateCount: student.lateCount || 0
                    });
                });
        });
        
        if (subjectRecords.length === 0) {
            alert(`No attendance records found for ${exportOption}`);
            return null;
        }
        
        let csv = `University of Southern Mindanao\n`;
        csv += `Attendance Report for ${course} (${semester})\n`;
        csv += `Report Generated: ${new Date().toLocaleString()}\n\n`;
        
        csv += `SUMMARY\n`;
        csv += `Total Students: ${subjectStudents.size}\n`;
        csv += `Total Present: ${subjectPresent}\n`;
        csv += `Total Late: ${subjectLate}\n`;
        csv += `Total Sessions: ${subjectRecords.length}\n\n`;
        
        csv += `STUDENT SUMMARY\n`;
        csv += `Student ID,Full Name,Program,Total Present,Total Late\n`;
        
        const studentSummaries = {};
        subjectRecords.forEach(record => {
            if (!studentSummaries[record.studentId]) {
                studentSummaries[record.studentId] = {
                    name: record.name,
                    program: record.program,
                    present: 0,
                    late: 0
                };
            }
            if (record.status === 'Present') studentSummaries[record.studentId].present++;
            if (record.status === 'Late') studentSummaries[record.studentId].late++;
        });
        
        Object.entries(studentSummaries).forEach(([studentId, summary]) => {
            csv += `"${studentId}","${summary.name}","${summary.program}","${summary.present}","${summary.late}"\n`;
        });
        
        csv += `\nDETAILED ATTENDANCE\n`;
        csv += `Student ID,Full Name,Program,Status,Class Time,Timestamp\n`;
        
        subjectRecords.forEach(record => {
            csv += `"${record.studentId}","${record.name}","${record.program}","${record.status}","${record.classTime}","${record.timestamp}"\n`;
        });
        
        return csv;
    }
    
    function downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Update current time
    function updateCurrentTime() {
        const timeEl = document.getElementById('current-time');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
    }
    setInterval(updateCurrentTime, 1000);
    updateCurrentTime();
});
