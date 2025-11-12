// Admin Panel JavaScript
(function() {
    // Check if admin is logged in
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (loggedInUser !== 'admin@gmail.com') {
        window.location.href = 'index.html';
        return;
    }

    // Wait for IndexedDB to initialize
    let dbReady = false;
    attendanceDB.init().then(async () => {
        dbReady = true;
        console.log('IndexedDB initialized for admin panel');
        
        // Check if migration is needed
        const hasLocalStorageData = localStorage.getItem('allStudents_admin@gmail.com');
        const existingStudents = await attendanceDB.getAllStudents();
        
        if (hasLocalStorageData && existingStudents.length === 0) {
            if (confirm('Detected localStorage data. Would you like to migrate it to IndexedDB?')) {
                try {
                    const count = await attendanceDB.migrateFromLocalStorage();
                    showNotification(`Successfully migrated ${count} students to IndexedDB!`, 'success');
                    renderStudents();
                } catch (error) {
                    showNotification('Migration failed: ' + error.message, 'error');
                }
            }
        } else {
            renderStudents();
        }
    }).catch(error => {
        console.error('Failed to initialize IndexedDB:', error);
        showNotification('Database initialization failed. Falling back to localStorage.', 'error');
    });

    // Get all students from IndexedDB
    async function getAllStudents() {
        if (!dbReady) {
            console.warn('Database not ready');
            return [];
        }
        
        try {
            const students = await attendanceDB.getAllStudents();
            // Add storageKey for compatibility
            return students.map(student => ({
                ...student,
                storageKey: `allStudents_${student.owner}`
            }));
        } catch (error) {
            console.error('Error getting students:', error);
            return [];
        }
    }
        const allStudents = [];
        
        // Get all keys from localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            
            // Check if it's a students database key
            if (key && key.startsWith('allStudents_')) {
                try {
                    const students = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(students)) {
                        students.forEach(student => {
                            // Add the owner information
                            const owner = key.replace('allStudents_', '');
                            allStudents.push({
                                ...student,
                                owner: owner,
                                storageKey: key
                            });
                        });
                    }
                } catch (e) {
                    console.error('Error parsing students from', key, e);
                }
            }
        }
        
        return allStudents;
    }

    // Save student to IndexedDB
    async function saveStudent(student) {
        if (!dbReady) {
            console.warn('Database not ready');
            return false;
        }
        
        try {
            await attendanceDB.addStudent({
                id: student.id,
                name: student.name,
                program: student.program,
                owner: student.owner,
                presentCount: student.presentCount || 0,
                lateCount: student.lateCount || 0,
                attendanceHistory: student.attendanceHistory || []
            });
            return true;
        } catch (error) {
            console.error('Error saving student:', error);
            return false;
        }
    }

    // Delete student from IndexedDB
    async function deleteStudent(student) {
        if (!dbReady) {
            console.warn('Database not ready');
            return false;
        }
        
        try {
            await attendanceDB.deleteStudent(student.id);
            return true;
        } catch (error) {
            console.error('Error deleting student:', error);
            return false;
        }
    }

    // Render students table
    async function renderStudents(students = null) {
        const tbody = document.getElementById('admin-student-list');
        const studentCount = document.getElementById('student-count');
        
        if (students === null) {
            students = await getAllStudents();
        }
        
        studentCount.textContent = students.length;
        
        if (students.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 3rem; text-align: center; color: var(--text-light);">
                        <svg style="width: 60px; height: 60px; margin: 0 auto 1rem; display: block; opacity: 0.3;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        No students found. Add your first student above.
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = students.map(student => `
            <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background='var(--light)'" onmouseout="this.style.background='white'">
                <td style="padding: 1rem; color: var(--text-light); font-family: monospace;">${student.id}</td>
                <td style="padding: 1rem; font-weight: 500; color: var(--text);">${student.name}</td>
                <td style="padding: 1rem; color: var(--text);">
                    <span style="background: var(--light); padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.9rem;">
                        ${student.program}
                    </span>
                </td>
                <td style="padding: 1rem; text-align: center;">
                    <span style="background: rgba(46, 204, 113, 0.1); color: var(--success); padding: 0.25rem 0.75rem; border-radius: 6px; font-weight: 600;">
                        ${student.presentCount || 0}
                    </span>
                </td>
                <td style="padding: 1rem; text-align: center;">
                    <span style="background: rgba(243, 156, 18, 0.1); color: var(--warning); padding: 0.25rem 0.75rem; border-radius: 6px; font-weight: 600;">
                        ${student.lateCount || 0}
                    </span>
                </td>
                <td style="padding: 0.75rem; text-align: center;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                        <button class="btn-edit" data-id="${student.id}" data-owner="${student.owner}" style="background: var(--primary); color: white; border: none; padding: 0.4rem 0.75rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(67, 97, 238, 0.3)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            <span>Edit</span>
                        </button>
                        <button class="btn-delete" data-id="${student.id}" data-owner="${student.owner}" style="background: var(--danger); color: white; border: none; padding: 0.4rem 0.75rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(231, 76, 60, 0.3)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            <span>Delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // Attach event listeners to edit and delete buttons
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', handleEdit);
        });
        
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', handleDelete);
        });
    }

    // Add student
    document.getElementById('add-student-btn').addEventListener('click', async () => {
        const name = document.getElementById('student-name').value.trim();
        const course = document.getElementById('student-course').value.trim();
        
        if (!name || !course) {
            alert('Please enter both student name and course.');
            return;
        }
        
        if (!dbReady) {
            showNotification('Database not ready. Please wait...', 'error');
            return;
        }
        
        // Create a student ID from the name
        const studentId = name.replace(/\s+/g, '_').toUpperCase();
        
        // Check if student already exists
        const existingStudent = await attendanceDB.getStudent(studentId);
        if (existingStudent) {
            alert('A student with this name already exists!');
            return;
        }
        
        // Add to IndexedDB
        await attendanceDB.addStudent({
            id: studentId,
            name: name,
            program: course,
            owner: 'admin@gmail.com',
            presentCount: 0,
            lateCount: 0,
            attendanceHistory: []
        });
        
        // Clear form
        document.getElementById('student-name').value = '';
        document.getElementById('student-course').value = '';
        
        // Refresh list
        renderStudents();
        
        // Show success message
        showNotification('Student added successfully!', 'success');
    });

    // Edit student
    let currentEditStudent = null;
    
    async function handleEdit(e) {
        const studentId = e.currentTarget.dataset.id;
        const owner = e.currentTarget.dataset.owner;
        
        const students = await getAllStudents();
        currentEditStudent = students.find(s => s.id === studentId && s.owner === owner);
        
        if (!currentEditStudent) {
            alert('Student not found!');
            return;
        }
        
        document.getElementById('edit-student-name').value = currentEditStudent.name;
        document.getElementById('edit-student-course').value = currentEditStudent.program;
        document.getElementById('edit-modal').style.display = 'flex';
    }

    document.getElementById('save-edit-btn').addEventListener('click', async () => {
        if (!currentEditStudent) return;
        
        const newName = document.getElementById('edit-student-name').value.trim();
        const newCourse = document.getElementById('edit-student-course').value.trim();
        
        if (!newName || !newCourse) {
            alert('Please enter both name and course.');
            return;
        }
        
        currentEditStudent.name = newName;
        currentEditStudent.program = newCourse;
        
        if (await saveStudent(currentEditStudent)) {
            document.getElementById('edit-modal').style.display = 'none';
            await renderStudents();
            showNotification('Student updated successfully!', 'success');
        } else {
            alert('Error saving student. Please try again.');
        }
    });

    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
        document.getElementById('edit-modal').style.display = 'none';
        currentEditStudent = null;
    });

    // Delete student
    async function handleDelete(e) {
        const studentId = e.currentTarget.dataset.id;
        const owner = e.currentTarget.dataset.owner;
        
        const students = await getAllStudents();
        const student = students.find(s => s.id === studentId && s.owner === owner);
        
        if (!student) {
            alert('Student not found!');
            return;
        }
        
        if (confirm(`Are you sure you want to delete ${student.name}? This action cannot be undone.`)) {
            if (await deleteStudent(student)) {
                await renderStudents();
                showNotification('Student deleted successfully!', 'success');
            } else {
                alert('Error deleting student. Please try again.');
            }
        }
    }

    // Search functionality
    document.getElementById('search-student').addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            await renderStudents();
            return;
        }
        
        const allStudents = await getAllStudents();
        const filtered = allStudents.filter(student => 
            student.name.toLowerCase().includes(searchTerm) ||
            student.program.toLowerCase().includes(searchTerm) ||
            student.id.toLowerCase().includes(searchTerm)
        );
        
        await renderStudents(filtered);
    });

    // Refresh list
    document.getElementById('refresh-list-btn').addEventListener('click', async () => {
        document.getElementById('search-student').value = '';
        await renderStudents();
        showNotification('List refreshed!', 'info');
    });

    // Logout
    document.getElementById('admin-logout-btn').addEventListener('click', () => {
        localStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
    });

    // Download Backup button
    document.getElementById('download-backup-btn').addEventListener('click', async () => {
        if (!dbReady) {
            showNotification('Database not ready. Please try again.', 'error');
            return;
        }
        
        try {
            const exportData = await attendanceDB.exportToJSON();
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `USM_Students_Backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification('Backup downloaded successfully!', 'success');
        } catch (error) {
            console.error('Backup error:', error);
            showNotification('Error creating backup: ' + error.message, 'error');
        }
    });

    // Export to JSON file
    document.getElementById('export-json-btn').addEventListener('click', async () => {
        if (!dbReady) {
            showNotification('Database not ready. Please try again.', 'error');
            return;
        }
        
        try {
            const exportData = await attendanceDB.exportToJSON();
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `USM_Students_Export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification('Student data exported successfully!', 'success');
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Error exporting data: ' + error.message, 'error');
        }
    });

    // Import from JSON file
    document.getElementById('import-json-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });

    document.getElementById('import-file-input').addEventListener('change', async (e) => {
        if (!dbReady) {
            showNotification('Database not ready. Please try again.', 'error');
            return;
        }
        
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            showNotification('Please select a valid JSON file', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importData = JSON.parse(event.target.result);

                // Validate data structure
                if (!importData.students) {
                    throw new Error('Invalid backup file format');
                }

                // Confirm before importing
                const studentCount = Object.values(importData.students).reduce((sum, arr) => sum + arr.length, 0);
                if (!confirm(`This will import ${studentCount} students. Current data will be merged. Continue?`)) {
                    e.target.value = ''; // Reset file input
                    return;
                }

                // Import using IndexedDB
                const result = await attendanceDB.importFromJSON(importData);

                // Refresh display
                await renderStudents();
                showNotification(`Successfully imported ${result.studentsImported} new students!`, 'success');
                
                // Reset file input
                e.target.value = '';
            } catch (error) {
                console.error('Import error:', error);
                showNotification('Error importing data: ' + error.message, 'error');
                e.target.value = '';
            }
        };

        reader.onerror = () => {
            showNotification('Error reading file', 'error');
            e.target.value = '';
        };

        reader.readAsText(file);
    });

    // Auto-save to localStorage (already implemented through save functions)
    // The system automatically saves to localStorage whenever changes are made

    // Show notification
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Add CSS animations for notifications
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    // Initialize: Check for auto-backup on page load
    checkAutoBackup();

    // Set up periodic auto-backup every 5 minutes
    setInterval(() => {
        autoSaveToJSON();
        console.log('Periodic auto-backup completed');
    }, BACKUP_INTERVAL);

    // Show last backup time on load
    const lastBackup = localStorage.getItem(AUTO_BACKUP_KEY);
    if (lastBackup) {
        const lastBackupDate = new Date(parseInt(lastBackup));
        console.log('Last backup:', lastBackupDate.toLocaleString());
        showNotification(`Data loaded. Last backup: ${lastBackupDate.toLocaleTimeString()}`, 'info');
    }
})();
