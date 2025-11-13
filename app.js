document.addEventListener('DOMContentLoaded', async () => {
    // Initialize IndexedDB
    let dbReady = false;
    await attendanceDB.init().then(() => {
        dbReady = true;
        console.log('IndexedDB initialized for attendance system');
    }).catch(error => {
        console.error('Failed to initialize IndexedDB:', error);
        alert('Database initialization failed. Please refresh the page.');
    });

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
    const classSelect = document.getElementById('class-select');
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
    let classesDB = [];
    let currentClassId = null;
    let currentClassName = null;
    let classStartTime = null;
    let currentClassTimeStr = null;
    let currentSessionId = null;
    let attendanceDataForCurrentSession = [];
    let currentClassRoster = [];
    let qrScanningActive = false;
    const recentScanCache = new Map();

    // --- Local Storage Helper Functions ---
    async function loadStudentsDB() {
        try {
            if (!loggedInUser || !dbReady) return [];
            const students = await attendanceDB.getStudentsByOwner(loggedInUser);
            return students.map(student => ({
                ...student,
                absentCount: student.absentCount || 0,
                classId: student.classId || null,
                className: student.className || null,
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
                    return {
                        ...record,
                        classId: record.classId || student.classId || null,
                        className: record.className || student.className || null
                    };
                })
            }));
        } catch (e) {
            console.error("Error loading studentsDB:", e);
            return [];
        }
    }

    async function saveStudentsDB() {
        try {
            if (!loggedInUser || !dbReady) {
                console.warn('Cannot save: loggedInUser=', loggedInUser, 'dbReady=', dbReady);
                return;
            }
            
            console.log('Saving', studentsDB.length, 'students to IndexedDB...');
            
            // Save each student to IndexedDB
            for (const student of studentsDB) {
                await attendanceDB.addStudent({
                    ...student,
                    owner: loggedInUser
                });
            }
            
            console.log('✅ Successfully saved students to IndexedDB');
            
            // Trigger auto-backup for attendance data
            await autoBackupAttendanceData();
        } catch (e) {
            console.error("Error saving studentsDB:", e);
        }
    }

    async function loadClassesDB() {
        try {
            console.log('loadClassesDB called, loggedInUser:', loggedInUser);
            
            if (!loggedInUser) {
                console.log('No logged in user, skipping class load');
                console.log('localStorage loggedInUser:', localStorage.getItem('loggedInUser'));
                return [];
            }
            
            // Wait for database to be ready if not already
            if (!dbReady || !attendanceDB.db) {
                console.log('Database not ready, initializing...');
                try {
                    await attendanceDB.init();
                    dbReady = true;
                    // Give mobile browsers extra time
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (initError) {
                    console.error('Failed to initialize database:', initError);
                    return [];
                }
            }
            
            // Double-check database connection (important for mobile)
            if (!attendanceDB.db) {
                console.error('Database connection not available after initialization');
                // Try one more time
                try {
                    await attendanceDB.init();
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (retryError) {
                    console.error('Retry initialization failed:', retryError);
                    return [];
                }
            }
            
            if (!attendanceDB.db) {
                console.error('Database connection still not available');
                return [];
            }
            
            // Verify classes store exists
            if (!attendanceDB.db.objectStoreNames.contains('classes')) {
                console.warn('Classes store does not exist, database may need upgrade');
                // Try to trigger upgrade by reinitializing with same version
                try {
                    await attendanceDB.init();
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (upgradeError) {
                    console.error('Upgrade attempt failed:', upgradeError);
                }
            }
            
            // Retry logic for mobile browsers (sometimes first attempt fails)
            let classes = [];
            let retries = 3;
            
            while (retries > 0 && (!classes || classes.length === 0)) {
                try {
                    classes = await attendanceDB.getAllClasses();
                    console.log(`Loaded classes (attempt ${4 - retries}):`, classes ? classes.length : 0);
                    console.log('Raw classes data:', JSON.stringify(classes, null, 2));
                    
                    if (classes && Array.isArray(classes) && classes.length > 0) {
                        break;
                    }
                } catch (error) {
                    console.warn(`Attempt ${4 - retries} failed:`, error);
                }
                
                retries--;
                if (retries > 0) {
                    // Wait a bit before retry (mobile browsers need more time)
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
            
            // Filter by owner if loggedInUser exists, but allow classes without owner (legacy data)
            if (classes && Array.isArray(classes) && loggedInUser) {
                classes = classes.filter(cls => !cls.owner || cls.owner === loggedInUser);
                console.log(`Filtered to ${classes.length} classes for user ${loggedInUser}`);
            }
            
            return Array.isArray(classes) ? classes : [];
        } catch (error) {
            console.error('Error loading classes:', error);
            return [];
        }
    }

    function updateClassSelectOptions() {
        if (!classSelect) {
            console.warn('Class select element not found');
            return;
        }

        const previousSelection = classSelect.value;
        classSelect.innerHTML = '';

        console.log('Updating class select with', classesDB.length, 'classes');
        console.log('Classes data:', JSON.stringify(classesDB, null, 2));

        if (!classesDB.length) {
            const option = document.createElement('option');
            option.value = '';
            // Check if we're on mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (isMobile) {
                option.textContent = 'No classes - Tap refresh (↻) button';
            } else {
                option.textContent = 'No classes available - Click refresh to reload';
            }
            classSelect.appendChild(option);
            classSelect.disabled = false; // Keep enabled so user can see the message
            return;
        }

        classSelect.disabled = false;

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select class';
        classSelect.appendChild(placeholder);

        classesDB.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        classesDB.forEach(cls => {
            if (!cls || !cls.classId || !cls.name) {
                console.warn('Invalid class data:', cls);
                return;
            }
            const option = document.createElement('option');
            option.value = cls.classId;
            option.textContent = cls.name;
            classSelect.appendChild(option);
        });

        if (previousSelection) {
            const optionToRestore = Array.from(classSelect.options).find(opt => opt.value === previousSelection);
            if (optionToRestore) {
                classSelect.value = previousSelection;
            }
        }
    }

    function findClassById(classId) {
        return classesDB.find(cls => cls.classId === classId);
    }

    function adjustAttendanceCounts(student, oldStatus, newStatus) {
        if (!student) return;

        const decrement = (field) => {
            if (typeof student[field] !== 'number') student[field] = 0;
            if (student[field] > 0) {
                student[field] -= 1;
            }
        };

        const increment = (field) => {
            if (typeof student[field] !== 'number') student[field] = 0;
            student[field] += 1;
        };

        if (oldStatus && oldStatus !== newStatus) {
            if (oldStatus === 'Present') decrement('presentCount');
            if (oldStatus === 'Late') decrement('lateCount');
            if (oldStatus === 'Absent') decrement('absentCount');
        }

        if (!oldStatus || oldStatus !== newStatus) {
            if (newStatus === 'Present') increment('presentCount');
            if (newStatus === 'Late') increment('lateCount');
            if (newStatus === 'Absent') increment('absentCount');
        }
    }

    function upsertAttendanceRecord(student, status) {
        if (!student) return;

        const existingRecord = (student.attendanceHistory || []).find(record => record.sessionId === currentSessionId);
        const timestamp = new Date().toISOString();

        if (existingRecord) {
            const oldStatus = existingRecord.status;
            existingRecord.status = status;
            existingRecord.classId = currentClassId;
            existingRecord.className = currentClassName;
            existingRecord.classTime = currentClassTimeStr;
            existingRecord.timestamp = timestamp;
            adjustAttendanceCounts(student, oldStatus, status);
        } else {
            if (!student.attendanceHistory) {
                student.attendanceHistory = [];
            }
            student.attendanceHistory.push({
                sessionId: currentSessionId,
                status,
                classId: currentClassId,
                className: currentClassName,
                classTime: currentClassTimeStr,
                timestamp
            });
            adjustAttendanceCounts(student, null, status);
        }
    }

    function prepareSessionRoster(selectedClass) {
        attendanceDataForCurrentSession = [];
        currentClassRoster = [];

        if (!selectedClass) return;

        const roster = Array.isArray(selectedClass.students) ? selectedClass.students : [];

        roster.forEach(classStudent => {
            if (!currentClassRoster.includes(classStudent.id)) {
                currentClassRoster.push(classStudent.id);
            }
            let student = studentsDB.find(s => s.id === classStudent.id);

            if (!student) {
                student = {
                    id: classStudent.id,
                    name: classStudent.name,
                    program: classStudent.program || '',
                    owner: loggedInUser,
                    classId: selectedClass.classId,
                    className: selectedClass.name,
                    presentCount: 0,
                    lateCount: 0,
                    absentCount: 0,
                    attendanceHistory: []
                };
                studentsDB.push(student);
            } else {
                student.classId = selectedClass.classId;
                student.className = selectedClass.name;
                if (typeof student.absentCount !== 'number') student.absentCount = 0;
            }

            const existingRecord = (student.attendanceHistory || []).find(record => record.sessionId === currentSessionId);

            if (!existingRecord) {
                upsertAttendanceRecord(student, 'Absent');
            }

            const record = (student.attendanceHistory || []).find(r => r.sessionId === currentSessionId);

            attendanceDataForCurrentSession.push({
                id: student.id,
                name: student.name,
                program: student.program,
                status: record ? record.status : 'Absent'
            });
        });

        attendanceDataForCurrentSession.sort((a, b) => a.name.localeCompare(b.name));
    }

    async function ensureStudentInCurrentClass(student) {
        if (!currentClassId || !student || !dbReady) return;

        const classIndex = classesDB.findIndex(cls => cls.classId === currentClassId);
        if (classIndex === -1) return;

        const classRecord = classesDB[classIndex];
        if (!Array.isArray(classRecord.students)) {
            classRecord.students = [];
        }

        if (!classRecord.students.find(s => s.id === student.id)) {
            classRecord.students.push({
                id: student.id,
                name: student.name,
                program: student.program
            });

            classRecord.updatedAt = new Date().toISOString();
            await attendanceDB.addClass(classRecord);
            classesDB[classIndex] = classRecord;
        }
    }

    // Auto-backup attendance data
    function autoBackupAttendanceData() {
        try {
            const exportData = {
                exportDate: new Date().toISOString(),
                version: '1.0',
                students: {}
            };

            // Collect all student databases
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                
                if (key && key.startsWith('allStudents_')) {
                    const owner = key.replace('allStudents_', '');
                    const students = JSON.parse(localStorage.getItem(key));
                    exportData.students[owner] = students;
                }
            }

            // Include NFC registry
            const nfcRegistry = localStorage.getItem('nfcRegistry');
            if (nfcRegistry) {
                exportData.nfcRegistry = JSON.parse(nfcRegistry);
            }

            // Save to localStorage backup
            localStorage.setItem('attendanceDataBackup', JSON.stringify(exportData));
            localStorage.setItem('lastBackupTimestamp', Date.now().toString());
        } catch (error) {
            console.error('Auto-backup error:', error);
        }
    }

    // --- UI State Management Functions ---
    async function initializeUserSession() {
        if (!loggedInUser) {
            showAuthSection();
            return;
        }
        
        // Ensure database is ready
        if (!dbReady || !attendanceDB.db) {
            try {
                await attendanceDB.init();
                dbReady = true;
                console.log('IndexedDB initialized for attendance system');
                // Extra wait for mobile browsers
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                if (isMobile) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                console.error('Failed to initialize IndexedDB:', error);
            }
        }
        
        studentsDB = await loadStudentsDB();
        classesDB = await loadClassesDB();
        
        // Mobile retry if no classes found
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile && classesDB.length === 0) {
            console.log('Mobile device: No classes on first load, retrying...');
            await new Promise(resolve => setTimeout(resolve, 800));
            classesDB = await loadClassesDB();
            console.log('Mobile retry result:', classesDB.length);
        }
        
        updateClassSelectOptions();
        showAttendanceSection();
        updateExportSubjectOptions();
    }
    
    // Initialize on page load
    if (loggedInUser) {
        await initializeUserSession();
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
        const absentCount = attendanceDataForCurrentSession.filter(s => s.status === 'Absent').length;
        const totalRoster = attendanceDataForCurrentSession.length;
        const attendedCount = presentCount + lateCount;

        presentCountDisplay.textContent = presentCount;
        lateCountDisplay.textContent = lateCount;
        
        const totalCountDisplay = document.getElementById('total-count');
        const attendanceRateDisplay = document.getElementById('attendance-rate');
        if (totalCountDisplay) totalCountDisplay.textContent = totalRoster;
        if (attendanceRateDisplay) {
            const rate = totalRoster > 0 ? Math.round((attendedCount / totalRoster) * 100) : 0;
            attendanceRateDisplay.textContent = rate + '%';
        }

        const absentBadge = document.getElementById('absent-count');
        if (absentBadge) absentBadge.textContent = absentCount;
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
        if (!exportSubjectSelect) return;

        const classMap = new Map();

        studentsDB.forEach(student => {
            (student.attendanceHistory || []).forEach(record => {
                if (record.classId) {
                    classMap.set(record.classId, record.className || record.classId);
                }
            });
        });

        classesDB.forEach(cls => {
            if (cls.classId) {
                classMap.set(cls.classId, cls.name);
            }
        });
        
        while (exportSubjectSelect.options.length > 2) {
            exportSubjectSelect.remove(2);
        }

        Array.from(classMap.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .forEach(([classId, className]) => {
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = className;
                exportSubjectSelect.appendChild(option);
            });
    }

    // --- Authentication Functions ---
    async function handleLogin() {
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
        
        // Ensure database is ready before loading data
        if (!dbReady || !attendanceDB.db) {
            try {
                await attendanceDB.init();
                dbReady = true;
                console.log('IndexedDB initialized after login');
                // Extra wait for mobile browsers
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error('Failed to initialize IndexedDB:', error);
            }
        }
        
        studentsDB = await loadStudentsDB();
        classesDB = await loadClassesDB();
        console.log('Classes loaded after login:', classesDB.length);
        
        // If no classes found, try one more time after a delay (mobile fix)
        if (classesDB.length === 0) {
            console.log('No classes found, retrying after delay...');
            await new Promise(resolve => setTimeout(resolve, 500));
            classesDB = await loadClassesDB();
            console.log('Classes after retry:', classesDB.length);
        }
        updateClassSelectOptions();
        showAttendanceSection();
        updateExportSubjectOptions();
        refreshStudentListUI();
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
                        processScannedId(scannedId); // Call async function (promise returned but not awaited - intentional for non-blocking scan)
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
    
    // Load NFC registry from IndexedDB
    async function loadNFCRegistry() {
        try {
            if (!dbReady) return {};
            const tags = await attendanceDB.getAllNFCTags();
            // Convert array to object for compatibility
            const registry = {};
            tags.forEach(tag => {
                registry[tag.nfcId] = {
                    studentId: tag.studentId,
                    name: tag.name,
                    course: tag.course,
                    registeredAt: tag.registeredAt
                };
            });
            return registry;
        } catch (e) {
            console.error('Error loading NFC registry:', e);
            return {};
        }
    }
    
    // Save NFC tag to IndexedDB
    async function saveNFCTag(nfcId, data) {
        try {
            if (!dbReady) return;
            await attendanceDB.addNFCTag({
                nfcId: nfcId,
                studentId: data.studentId,
                name: data.name,
                course: data.course,
                registeredAt: data.registeredAt || new Date().toISOString()
            });
        } catch (e) {
            console.error('Error saving NFC tag:', e);
        }
    }
    
    // Register NFC tag with student data
    async function registerNFCTag(nfcId, studentName, studentCourse) {
        const registry = await loadNFCRegistry();
        const studentId = studentName.replace(/\s+/g, '_').toUpperCase();
        
        // Check if NFC tag already registered
        if (registry[nfcId]) {
            showScanWarningAnimation(registry[nfcId].name, 'NFC tag already registered to this student');
            return false;
        }
        
        // Register the NFC tag
        const tagData = {
            studentId: studentId,
            name: studentName,
            course: studentCourse,
            registeredAt: new Date().toISOString()
        };
        
        await saveNFCTag(nfcId, tagData);

        // Ensure the student exists in the local roster and persist to IndexedDB
        let student = studentsDB.find(s => s.id === studentId);
        if (!student) {
            student = {
                id: studentId,
                name: studentName,
                program: studentCourse,
                owner: loggedInUser || 'admin@gmail.com', // Default to admin if no user logged in
                classId: null,
                className: null,
                presentCount: 0,
                lateCount: 0,
                absentCount: 0,
                attendanceHistory: []
            };
            studentsDB.push(student);
        } else {
            // Keep student profile in sync with the latest registration info
            student.name = studentName;
            student.program = studentCourse;
            // Preserve owner if exists, otherwise set to current user or admin
            if (!student.owner) {
                student.owner = loggedInUser || 'admin@gmail.com';
            }
            if (typeof student.absentCount !== 'number') student.absentCount = 0;
        }

        // Always save student to database (registration)
        await saveStudentsDB();

        showScanSuccessAnimation(studentName, 'NFC Tag Registered');
        return true;
    }
    
    // Process NFC scan for attendance
    async function processNFCScan(nfcId) {
        const registry = await loadNFCRegistry();
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
        
        const studentId = studentData.studentId;

        // Always register/update student in database, even without active session
        let student = studentsDB.find(s => s.id === studentId);
        const isNewStudent = !student;

        if (!student) {
            student = {
                id: studentId,
                name: studentData.name,
                program: studentData.course || '',
                owner: loggedInUser || 'admin@gmail.com', // Default to admin if no user logged in
                classId: currentClassId || null,
                className: currentClassName || null,
                presentCount: 0,
                lateCount: 0,
                absentCount: 0,
                attendanceHistory: []
            };
            studentsDB.push(student);
        } else {
            // Update existing student info
            student.name = studentData.name;
            student.program = studentData.course || student.program;
            // Preserve owner if exists, otherwise set to current user or admin
            if (!student.owner) {
                student.owner = loggedInUser || 'admin@gmail.com';
            }
            // Update class info if session is active
            if (currentClassId) {
                student.classId = currentClassId;
                student.className = currentClassName;
            }
            if (typeof student.absentCount !== 'number') student.absentCount = 0;
        }

        // Save student to database immediately (registration)
        await saveStudentsDB();

        // If no active session, just register the student
        if (!currentSessionId) {
            showNfcSuccess(student.name, isNewStudent ? 'Registered' : 'Updated');
            return;
        }

        const currentTime = new Date();
        const lateThresholdMinutes = 15;
        const lateTime = new Date(classStartTime.getTime() + lateThresholdMinutes * 60 * 1000);
        const determinedStatus = currentTime > lateTime ? 'Late' : 'Present';

        const sessionEntry = attendanceDataForCurrentSession.find(rec => rec.id === studentId);

        if (sessionEntry && (sessionEntry.status === 'Present' || sessionEntry.status === 'Late')) {
            showNfcWarning(studentData.name, `Already marked as ${sessionEntry.status} for this session`);
            return;
        }

        upsertAttendanceRecord(student, determinedStatus);

        if (sessionEntry) {
            sessionEntry.status = determinedStatus;
        } else {
            attendanceDataForCurrentSession.push({
                id: student.id,
                name: student.name,
                program: student.program,
                status: determinedStatus
            });
            if (!currentClassRoster.includes(student.id)) {
                currentClassRoster.push(student.id);
            }
        }

        attendanceDataForCurrentSession.sort((a, b) => a.name.localeCompare(b.name));

        await ensureStudentInCurrentClass(student);
        await saveStudentsDB();
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
            
            nfcReader.onreading = async (event) => {
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
                    await processNFCScan(nfcId);
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
    async function processScannedId(scannedData) {
        console.log('🔍 Processing scanned data:', scannedData);
        
        // Parse QR code format: "FULL NAME,COURSE,,"
        const parts = scannedData.split(',');
        if (parts.length < 2) {
            showPermissionModal('Invalid QR code format. Expected: "FULL NAME,COURSE,,"', 'error');
            return;
        }

        const studentName = parts[0].trim();
        const studentCourse = parts[1].trim();
        
        console.log('👤 Student:', studentName, '| Course:', studentCourse);
        
        if (!studentName || !studentCourse) {
            showPermissionModal('Invalid QR code data. Name and course are required.', 'error');
            return;
        }

        // Check if this is for NFC registration
        if (pendingNFCRegistration) {
            const nfcId = pendingNFCRegistration;
            pendingNFCRegistration = null;
            await registerNFCTag(nfcId, studentName, studentCourse);
            return;
        }

        // Generate unique ID from name
        const id = studentName.replace(/\s+/g, '_').toUpperCase();

        // Always register/update student in database, even without active session
        let student = studentsDB.find(s => s.id === id);
        const isNewStudent = !student;

        if (!student) {
            student = {
                id,
                name: studentName,
                program: studentCourse,
                owner: loggedInUser || 'admin@gmail.com', // Default to admin if no user logged in
                classId: currentClassId || null,
                className: currentClassName || null,
                presentCount: 0,
                lateCount: 0,
                absentCount: 0,
                attendanceHistory: []
            };
            studentsDB.push(student);
        } else {
            // Update existing student info
            student.name = studentName;
            student.program = studentCourse || student.program;
            // Preserve owner if exists, otherwise set to current user or admin
            if (!student.owner) {
                student.owner = loggedInUser || 'admin@gmail.com';
            }
            // Update class info if session is active
            if (currentClassId) {
                student.classId = currentClassId;
                student.className = currentClassName;
            }
            if (typeof student.absentCount !== 'number') student.absentCount = 0;
        }

        // Save student to database immediately (registration)
        await saveStudentsDB();

        // If no active session, just register the student
        if (!currentSessionId) {
            showScanSuccessAnimation(student.name, isNewStudent ? 'Registered' : 'Updated');
            return;
        }
        
        console.log('📋 Current Session:', currentSessionId, '| Class:', currentClassName);

        const sessionEntry = attendanceDataForCurrentSession.find(rec => rec.id === id);
        if (sessionEntry && (sessionEntry.status === 'Present' || sessionEntry.status === 'Late')) {
            showScanWarningAnimation(sessionEntry.name, `Already marked as ${sessionEntry.status} for this session`);
            return;
        }

        const currentTime = new Date();
        const lateThresholdMinutes = 15;
        const lateTime = new Date(classStartTime.getTime() + lateThresholdMinutes * 60 * 1000);
        const determinedStatus = currentTime > lateTime ? 'Late' : 'Present';

        upsertAttendanceRecord(student, determinedStatus);

        if (sessionEntry) {
            sessionEntry.status = determinedStatus;
        } else {
            attendanceDataForCurrentSession.push({
                id: student.id,
                name: student.name,
                program: student.program,
                status: determinedStatus
            });
            if (!currentClassRoster.includes(student.id)) {
                currentClassRoster.push(student.id);
            }
        }

        attendanceDataForCurrentSession.sort((a, b) => a.name.localeCompare(b.name));

        await ensureStudentInCurrentClass(student);
        await saveStudentsDB();
        refreshStudentListUI();
        updateExportSubjectOptions();
        showScanSuccessAnimation(student.name, determinedStatus);
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
        studentsDB = [];
        classesDB = [];
        currentClassId = null;
        currentClassName = null;
        classStartTime = null;
        currentClassTimeStr = null;
        currentSessionId = null;
        attendanceDataForCurrentSession = [];
        currentClassRoster = [];
        updateClassSelectOptions();
        refreshStudentListUI();
        showAuthSection();
        stopQrScanner();
    });

    // End Session & Logout button (in attendance capture section)
    const endSessionLogoutBtn = document.getElementById('end-session-logout-btn');
    if (endSessionLogoutBtn) {
        endSessionLogoutBtn.addEventListener('click', () => {
            // Confirm before ending session and logging out
            if (confirm('Are you sure you want to end this session and logout? All unsaved data will be lost.')) {
                localStorage.removeItem('loggedInUser');
                loggedInUser = null;
                studentsDB = [];
                classesDB = [];
                currentClassId = null;
                currentClassName = null;
                classStartTime = null;
                currentClassTimeStr = null;
                currentSessionId = null;
                attendanceDataForCurrentSession = [];
                currentClassRoster = [];
                updateClassSelectOptions();
                refreshStudentListUI();
                showAuthSection();
                stopQrScanner();
                closeNfcDialog(); // Close NFC dialog if open
            }
        });
    }

    // Refresh classes button
    const refreshClassesBtn = document.getElementById('refresh-classes-btn');
    if (refreshClassesBtn) {
        refreshClassesBtn.addEventListener('click', async () => {
            console.log('Refreshing classes...');
            
            // Re-read loggedInUser from localStorage in case it was set but variable was cleared
            if (!loggedInUser) {
                loggedInUser = localStorage.getItem('loggedInUser');
                console.log('Re-loaded loggedInUser from localStorage:', loggedInUser);
            }
            
            console.log('Current loggedInUser:', loggedInUser);
            
            // Force reinitialize database on mobile
            try {
                await attendanceDB.init();
                dbReady = true;
                // Extra wait for mobile
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (initError) {
                console.warn('Reinitialization warning:', initError);
            }
            
            classesDB = await loadClassesDB();
            console.log('Classes refreshed:', classesDB.length);
            updateClassSelectOptions();
            if (classesDB.length > 0) {
                showPermissionModal(`Loaded ${classesDB.length} class(es)`, 'info');
            } else {
                showPermissionModal('No classes found. Make sure classes are created in the admin panel and try refreshing again.', 'error');
            }
        });
    }

    if (startSessionBtn) {
        // Ensure button is enabled and clickable
        startSessionBtn.disabled = false;
        startSessionBtn.style.pointerEvents = 'auto';
        startSessionBtn.style.cursor = 'pointer';
        
        startSessionBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Start session button clicked');
            
            const selectedClassId = classSelect ? classSelect.value : '';
            const timeInput = document.getElementById('class-time') ? document.getElementById('class-time').value : '';

            if (!selectedClassId || !timeInput) {
                showPermissionModal('Please select a class and set the class time before starting the session.', 'error');
                return;
            }

        // Check if Quick Attendance is selected
        if (selectedClassId === 'QUICK_ATTENDANCE') {
            // Quick Attendance mode - no class required
            currentClassId = 'QUICK_ATTENDANCE';
            currentClassName = 'Quick Attendance';
            currentClassTimeStr = timeInput;

            const now = new Date();
            const [hours, minutes] = timeInput.split(':').map(Number);
            classStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

            currentSessionId = `QUICK-${now.toISOString().slice(0, 10)}-${timeInput.replace(':', '')}`;

            // Clear previous session data
            attendanceDataForCurrentSession = [];

            await saveStudentsDB();

            sessionSettings.classList.add('hidden');
            attendanceCapture.classList.remove('hidden');
            attendanceDisplay.classList.remove('hidden');
            updateStatusCounters();
            refreshStudentListUI();
            
            // Update session info display
            const sessionInfo = document.getElementById('current-session-info');
            if (sessionInfo) {
                sessionInfo.textContent = `⚡ Quick Attendance at ${currentClassTimeStr}`;
            }
            
            showPermissionModal(`Quick Attendance session started at ${currentClassTimeStr}. Scan QR codes to record attendance.`, 'info');
            return;
        }

        // Regular class-based attendance
        const selectedClass = findClassById(selectedClassId);

        if (!selectedClass) {
            showPermissionModal('Selected class could not be found. Please refresh and try again.', 'error');
            return;
        }

        currentClassId = selectedClass.classId;
        currentClassName = selectedClass.name;
        currentClassTimeStr = timeInput;

        const now = new Date();
        const [hours, minutes] = timeInput.split(':').map(Number);
        classStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

        currentSessionId = `${currentClassId}-${now.toISOString().slice(0, 10)}-${timeInput.replace(':', '')}`;

        prepareSessionRoster(selectedClass);

        await saveStudentsDB();

        sessionSettings.classList.add('hidden');
        attendanceCapture.classList.remove('hidden');
        attendanceDisplay.classList.remove('hidden');
        updateStatusCounters();
        refreshStudentListUI();
        
        // Update session info display
        const sessionInfo = document.getElementById('current-session-info');
        if (sessionInfo) {
            sessionInfo.textContent = `${currentClassName} at ${currentClassTimeStr}`;
        }
        
        showPermissionModal(`Session for ${currentClassName} at ${currentClassTimeStr} started.`, 'info');
        });
    } else {
        console.error('Start session button not found in DOM');
    }

    if (scanQrBtn) {
        scanQrBtn.addEventListener('click', () => {
            // Allow scanning even without session for student registration
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
    }

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
            if (!currentClassId || attendanceDataForCurrentSession.length === 0) {
                alert('No attendance data for the current session to export.');
                return;
            }
            
            csv = generateCurrentSessionCSV();
            const classLabel = currentClassName ? currentClassName.replace(/\s/g, '_') : 'Class';
            const filename = `USM_Attendance_${classLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
            downloadCSV(csv, filename);
            
        } else if (exportOption === 'all') {
            csv = generateAllSessionsCSV();
            downloadCSV(csv, `USM_Attendance_Complete_Report_${new Date().toISOString().slice(0, 10)}.csv`);
            
        } else {
            csv = generateSubjectCSV(exportOption);
            if (csv) {
                const classRecord = findClassById(exportOption);
                const classLabel = classRecord ? classRecord.name : exportOption;
                downloadCSV(csv, `USM_Attendance_${classLabel.replace(/\s/g, '_')}.csv`);
            }
        }
    });

    // PDF Export functionality
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', async () => {
            if (studentsDB.length === 0) {
                alert('No student data to export.');
                return;
            }
            
            const exportOption = exportSubjectSelect.value;
            
            if (exportOption === 'current') {
                // Export current session only
                if (!currentClassId || attendanceDataForCurrentSession.length === 0) {
                    alert('No attendance data for the current session to export.');
                    return;
                }
                
                try {
                    await generateCurrentSessionPDF();
                } catch (error) {
                    console.error('PDF export error:', error);
                    alert('Error generating PDF: ' + error.message);
                }
            } else {
                alert('PDF export is currently only available for the current session.');
            }
        });
    }

    async function generateCurrentSessionPDF() {
        // Check for PDF library (pdf-lib uses PDFLib as global)
        if (typeof PDFLib === 'undefined' && typeof window.PDFLib === 'undefined') {
            alert('PDF library not loaded. Please refresh the page and try again.');
            return;
        }
        
        const pdfLib = typeof PDFLib !== 'undefined' ? PDFLib : window.PDFLib;

        try {
            // Show loading message
            console.log('Generating PDF...');
            
            // Create a new PDF document
            const pdfDoc = await pdfLib.PDFDocument.create();
            
            // Page setup (A4 size)
            const page = pdfDoc.addPage([595, 842]); // A4 dimensions in points
            const { width, height } = page.getSize();
            
            // Get class information
            let className = currentClassName || 'Unassigned Class';
            // Check if it's Quick Attendance and display as "Quick Scan"
            if (currentClassId === 'QUICK_ATTENDANCE' || className === 'Quick Attendance') {
                className = 'Quick Scan';
            }
            const classTime = currentClassTimeStr || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const currentDate = new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            
            // Get course/program from first student
            let courseName = '';
            const firstStudent = attendanceDataForCurrentSession[0];
            if (firstStudent) {
                const student = studentsDB.find(s => s.id === firstStudent.id);
                if (student && student.program) {
                    courseName = student.program;
                }
            }
            
            // Load and embed the logo
            let logoImage = null;
            try {
                const logoPath = 'usm_logo_Aug-2024.png';
                const logoResponse = await fetch(logoPath);
                if (logoResponse.ok) {
                    const logoBytes = await logoResponse.arrayBuffer();
                    logoImage = await pdfDoc.embedPng(logoBytes);
                }
            } catch (logoError) {
                console.warn('Could not load logo:', logoError);
            }
            
            // Embed fonts
            const helveticaBold = await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);
            const helvetica = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
            
            // Center text helper
            const centerText = (text, y, size, font) => {
                const textWidth = font.widthOfTextAtSize(text, size);
                page.drawText(text, {
                    x: (width - textWidth) / 2,
                    y: y,
                    size: size,
                    font: font,
                    color: pdfLib.rgb(0, 0, 0),
                });
            };
            
            // Draw logo and header text aligned on the left
            const headerY = height - 40;
            const leftMarginLogo = 50; // Left margin for logo and text alignment
            
            if (logoImage) {
                const logoDims = logoImage.scale(0.05); // Reduced to 5% of original size (even smaller)
                const logoY = headerY - (logoDims.height / 2) + 9; // Align vertically with text (text is 18pt, so center logo with text)
                
                page.drawImage(logoImage, {
                    x: leftMarginLogo, // Left aligned
                    y: logoY,
                    width: logoDims.width,
                    height: logoDims.height,
                });
            }
            
            // Draw header text aligned with logo (left side)
            const textX = logoImage ? leftMarginLogo + logoImage.scale(0.05).width + 15 : leftMarginLogo; // Add spacing after logo
            page.drawText('University of Southern Mindanao', {
                x: textX,
                y: headerY,
                size: 18,
                font: helveticaBold,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            const generatedAt = new Date().toLocaleString();
            const presentStudents = attendanceDataForCurrentSession.filter(s => s.status === 'Present').length;
            const lateStudents = attendanceDataForCurrentSession.filter(s => s.status === 'Late').length;
            const absentStudents = attendanceDataForCurrentSession.filter(s => s.status === 'Absent').length;
            const totalStudents = attendanceDataForCurrentSession.length;
            const attendedStudents = presentStudents + lateStudents;
            
            let currentY = headerY - 60; // Increased spacing from 30 to 60 to avoid overlap
            const leftMargin = 50;
            const fontSize = 11;
            
            // Attendance Report for [Class]
            page.drawText(`Attendance Report for ${className}`, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            // Class Time
            currentY -= 18;
            page.drawText(`Class Time: ${classTime}`, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            // Report Generated
            currentY -= 18;
            page.drawText(`Report Generated: ${generatedAt}`, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            // SUMMARY section
            currentY -= 30;
            page.drawText('SUMMARY', {
                x: leftMargin,
                y: currentY,
                size: 12,
                font: helveticaBold,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            currentY -= 18;
            page.drawText(`Total Students: ${totalStudents}`, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            currentY -= 18;
            page.drawText(`Present: ${presentStudents}`, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            currentY -= 18;
            page.drawText(`Late: ${lateStudents}`, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            currentY -= 18;
            page.drawText(`Absent: ${absentStudents}`, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            currentY -= 18;
            const attendanceRate = totalStudents > 0 ? Math.round((attendedStudents / totalStudents) * 100) : 0;
            page.drawText(`Attendance Rate: ${attendanceRate}%`, {
                x: leftMargin,
                y: currentY,
                size: fontSize,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            // Sort students alphabetically and get detailed data first
            const sortedStudents = [...attendanceDataForCurrentSession]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(sessionRecord => {
                    const student = studentsDB.find(s => s.id === sessionRecord.id);
                    const record = student ? (student.attendanceHistory || []).find(r => r.sessionId === currentSessionId) : null;
                    return {
                        id: student?.id || sessionRecord.id,
                        name: student?.name || sessionRecord.name,
                        program: student?.program || '',
                        status: sessionRecord.status,
                        timestamp: record?.timestamp || new Date().toISOString()
                    };
                });
            
            // DETAILED ATTENDANCE section
            currentY -= 30;
            page.drawText('DETAILED ATTENDANCE', {
                x: leftMargin,
                y: currentY,
                size: 12,
                font: helveticaBold,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            // Table setup (removed Student ID column)
            currentY -= 25;
            const tableLeftMargin = leftMargin;
            const tableWidth = width - (tableLeftMargin * 2);
            // Calculate column widths to fit within table (with some padding)
            const totalColumnWidth = tableWidth - 10; // Leave 10 points for padding/margins
            const col1Width = Math.floor(totalColumnWidth * 0.45); // Full Name - 45%
            const col2Width = Math.floor(totalColumnWidth * 0.25); // Program - 25%
            const col3Width = Math.floor(totalColumnWidth * 0.15); // Status - 15%
            const col4Width = Math.floor(totalColumnWidth * 0.15); // Time - 15%
            
            // Draw table header background
            page.drawRectangle({
                x: tableLeftMargin,
                y: currentY - 20,
                width: tableWidth,
                height: 20,
                color: pdfLib.rgb(0.9, 0.9, 0.9),
            });
            
            // Draw header text (removed Student ID)
            page.drawText('Full Name', {
                x: tableLeftMargin + 5,
                y: currentY - 15,
                size: 9,
                font: helveticaBold,
                color: pdfLib.rgb(0, 0, 0),
            });
            page.drawText('Program', {
                x: tableLeftMargin + col1Width + 5,
                y: currentY - 15,
                size: 9,
                font: helveticaBold,
                color: pdfLib.rgb(0, 0, 0),
            });
            page.drawText('Status', {
                x: tableLeftMargin + col1Width + col2Width + 5,
                y: currentY - 15,
                size: 9,
                font: helveticaBold,
                color: pdfLib.rgb(0, 0, 0),
            });
            page.drawText('Time', {
                x: tableLeftMargin + col1Width + col2Width + col3Width + 5,
                y: currentY - 15,
                size: 9,
                font: helveticaBold,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            // Draw table border
            const tableHeight = Math.min(sortedStudents.length * 15 + 20, height - currentY - 100);
            page.drawRectangle({
                x: tableLeftMargin,
                y: currentY - tableHeight,
                width: tableWidth,
                height: tableHeight,
                borderColor: pdfLib.rgb(0, 0, 0),
                borderWidth: 1,
            });
            
            // Draw vertical lines (separating all columns including Time)
            let xPos = tableLeftMargin;
            [col1Width, col2Width, col3Width, col4Width].forEach(colWidth => {
                xPos += colWidth;
                // Don't draw line at the very end (right edge of table)
                if (xPos < tableLeftMargin + tableWidth - 1) {
                    page.drawLine({
                        start: { x: xPos, y: currentY },
                        end: { x: xPos, y: currentY - tableHeight },
                        thickness: 1,
                        color: pdfLib.rgb(0, 0, 0),
                    });
                }
            });
            
            // Draw horizontal line under header
            page.drawLine({
                start: { x: tableLeftMargin, y: currentY - 20 },
                end: { x: tableLeftMargin + tableWidth, y: currentY - 20 },
                thickness: 1,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            // Draw student list
            let studentY = currentY - 35;
            const lineHeight = 15;
            const maxStudentsPerPage = Math.floor((currentY - 100) / lineHeight);
            
            sortedStudents.slice(0, maxStudentsPerPage).forEach((student, index) => {
                // Full Name (no truncation - show complete name)
                page.drawText(student.name, {
                    x: tableLeftMargin + 5,
                    y: studentY,
                    size: 8,
                    font: helvetica,
                    color: pdfLib.rgb(0, 0, 0),
                });
                
                // Program
                const program = student.program.length > 18 ? student.program.substring(0, 15) + '...' : student.program;
                page.drawText(program || 'N/A', {
                    x: tableLeftMargin + col1Width + 5,
                    y: studentY,
                    size: 8,
                    font: helvetica,
                    color: pdfLib.rgb(0, 0, 0),
                });
                
                // Status
                const statusColor = student.status === 'Present' ? pdfLib.rgb(0, 0.6, 0) : 
                                    student.status === 'Late' ? pdfLib.rgb(0.8, 0.5, 0) : 
                                    pdfLib.rgb(0.8, 0, 0);
                page.drawText(student.status, {
                    x: tableLeftMargin + col1Width + col2Width + 5,
                    y: studentY,
                    size: 8,
                    font: helvetica,
                    color: statusColor,
                });
                
                // Time only (no date) - ensure it fits in the column
                const timeOnly = new Date(student.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                // Calculate position within the time column (with padding)
                const timeX = tableLeftMargin + col1Width + col2Width + col3Width + 5;
                page.drawText(timeOnly, {
                    x: timeX,
                    y: studentY,
                    size: 8,
                    font: helvetica,
                    color: pdfLib.rgb(0, 0, 0),
                });
                
                // Draw horizontal line
                if (index < sortedStudents.length - 1 && index < maxStudentsPerPage - 1) {
                    page.drawLine({
                        start: { x: tableLeftMargin, y: studentY - 5 },
                        end: { x: tableLeftMargin + tableWidth, y: studentY - 5 },
                        thickness: 0.5,
                        color: pdfLib.rgb(0.7, 0.7, 0.7),
                    });
                }
                
                studentY -= lineHeight;
            });
            
            // Draw "Verified by:" at the bottom
            const verifiedY = 60;
            page.drawText('Verified by: _________________________', {
                x: tableLeftMargin,
                y: verifiedY,
                size: 11,
                font: helvetica,
                color: pdfLib.rgb(0, 0, 0),
            });
            
            // Save the PDF
            const pdfBytes = await pdfDoc.save();
            
            // Download the PDF
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const classLabel = className.replace(/\s/g, '_');
            link.download = `USM_Attendance_${classLabel}_${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            // Show success message
            alert('PDF exported successfully!');
        } catch (error) {
            console.error('PDF generation error:', error);
            alert('Error generating PDF: ' + error.message);
        }
    }
    
    function generateCurrentSessionCSV() {
        const classLabel = currentClassName || 'Unassigned Class';
        const generatedAt = new Date().toLocaleString();

        const presentStudents = attendanceDataForCurrentSession.filter(s => s.status === 'Present').length;
        const lateStudents = attendanceDataForCurrentSession.filter(s => s.status === 'Late').length;
        const absentStudents = attendanceDataForCurrentSession.filter(s => s.status === 'Absent').length;
        const totalStudents = attendanceDataForCurrentSession.length;
        const attendedStudents = presentStudents + lateStudents;

        let csv = `University of Southern Mindanao\n`;
        csv += `Attendance Report for ${classLabel}\n`;
        csv += `Class Time: ${currentClassTimeStr}\n`;
        csv += `Report Generated: ${generatedAt}\n\n`;
        
        csv += `SUMMARY\n`;
        csv += `Total Students: ${totalStudents}\n`;
        csv += `Present: ${presentStudents}\n`;
        csv += `Late: ${lateStudents}\n`;
        csv += `Absent: ${absentStudents}\n`;
        csv += `Attendance Rate: ${totalStudents > 0 ? Math.round((attendedStudents / totalStudents) * 100) : 0}%\n\n`;
        
        csv += `DETAILED ATTENDANCE\n`;
        csv += `Student ID,Full Name,Program,Status,Timestamp\n`;
        
        attendanceDataForCurrentSession.forEach(sessionRecord => {
            const student = studentsDB.find(s => s.id === sessionRecord.id);
            if (student) {
                const record = (student.attendanceHistory || []).find(r => r.sessionId === currentSessionId);
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
        
        const classes = {};
        studentsDB.forEach(student => {
            (student.attendanceHistory || []).forEach(record => {
                const classId = record.classId || student.classId;
                if (!classId) return;

                const className = record.className || student.className || classId;

                if (!classes[classId]) {
                    classes[classId] = {
                        name: className,
                        students: new Set(),
                        present: 0,
                        late: 0,
                        absent: 0,
                        records: []
                    };
                }
                
                const classData = classes[classId];
                classData.students.add(student.id);

                if (record.status === 'Present') classData.present++;
                if (record.status === 'Late') classData.late++;
                if (record.status === 'Absent') classData.absent++;

                classData.records.push({
                    studentId: student.id,
                    name: student.name,
                    program: student.program,
                    status: record.status,
                    classTime: record.classTime,
                    timestamp: record.timestamp
                });
            });
        });
        
        Object.values(classes)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(classData => {
                const totalSessions = classData.records.length;
                csv += `\nCLASS: ${classData.name}\n`;
                csv += `Total Students: ${classData.students.size}\n`;
                csv += `Total Present: ${classData.present}\n`;
                csv += `Total Late: ${classData.late}\n`;
                csv += `Total Absent: ${classData.absent}\n`;
                csv += `Total Entries: ${totalSessions}\n\n`;
                
                csv += `Student ID,Full Name,Program,Status,Class Time,Timestamp\n`;
                classData.records.forEach(record => {
                    csv += `"${record.studentId}","${record.name}","${record.program}","${record.status}","${record.classTime || ''}","${record.timestamp || ''}"\n`;
                });
            });
        
        return csv;
    }
    
    function generateSubjectCSV(classId) {
        const classDetails = findClassById(classId);
        const classLabel = classDetails ? classDetails.name : classId;

        const subjectRecords = [];
        const subjectStudents = new Set();
        let subjectPresent = 0;
        let subjectLate = 0;
        let subjectAbsent = 0;
        
        studentsDB.forEach(student => {
            (student.attendanceHistory || [])
                .filter(record => record.classId === classId)
                .forEach(record => {
                    subjectStudents.add(student.id);
                    if (record.status === 'Present') subjectPresent++;
                    if (record.status === 'Late') subjectLate++;
                    if (record.status === 'Absent') subjectAbsent++;
                    subjectRecords.push({
                        studentId: student.id,
                        name: student.name,
                        program: student.program,
                        status: record.status,
                        classTime: record.classTime,
                        timestamp: record.timestamp
                    });
                });
        });
        
        if (subjectRecords.length === 0) {
            alert(`No attendance records found for ${classLabel}`);
            return null;
        }
        
        let csv = `University of Southern Mindanao\n`;
        csv += `Attendance Report for ${classLabel}\n`;
        csv += `Report Generated: ${new Date().toLocaleString()}\n\n`;
        
        csv += `SUMMARY\n`;
        csv += `Total Students: ${subjectStudents.size}\n`;
        csv += `Total Present: ${subjectPresent}\n`;
        csv += `Total Late: ${subjectLate}\n`;
        csv += `Total Absent: ${subjectAbsent}\n`;
        csv += `Total Entries: ${subjectRecords.length}\n\n`;
        
        csv += `STUDENT SUMMARY\n`;
        csv += `Student ID,Full Name,Program,Total Present,Total Late,Total Absent\n`;
        
        const studentSummaries = {};
        subjectRecords.forEach(record => {
            if (!studentSummaries[record.studentId]) {
                studentSummaries[record.studentId] = {
                    name: record.name,
                    program: record.program,
                    present: 0,
                    late: 0,
                    absent: 0
                };
            }
            if (record.status === 'Present') studentSummaries[record.studentId].present++;
            if (record.status === 'Late') studentSummaries[record.studentId].late++;
            if (record.status === 'Absent') studentSummaries[record.studentId].absent++;
        });
        
        Object.entries(studentSummaries).forEach(([studentId, summary]) => {
            csv += `"${studentId}","${summary.name}","${summary.program}","${summary.present}","${summary.late}","${summary.absent}"\n`;
        });
        
        csv += `\nDETAILED ATTENDANCE\n`;
        csv += `Student ID,Full Name,Program,Status,Class Time,Timestamp\n`;
        
        subjectRecords.forEach(record => {
            csv += `"${record.studentId}","${record.name}","${record.program}","${record.status}","${record.classTime || ''}","${record.timestamp || ''}"\n`;
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
