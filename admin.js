// Admin Panel JavaScript
(function() {
    // Check if admin is logged in
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (loggedInUser !== 'admin@gmail.com') {
        window.location.href = 'index.html';
        return;
    }

    // Get all students from all users combined
    function getAllStudents() {
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

    // Save students back to their respective owners
    function saveStudent(student) {
        const key = student.storageKey;
        try {
            const students = JSON.parse(localStorage.getItem(key)) || [];
            const index = students.findIndex(s => s.id === student.id);
            
            if (index !== -1) {
                // Update existing student
                students[index] = {
                    id: student.id,
                    name: student.name,
                    program: student.program,
                    presentCount: student.presentCount || 0,
                    lateCount: student.lateCount || 0,
                    attendanceHistory: student.attendanceHistory || []
                };
            } else {
                // Add new student
                students.push({
                    id: student.id,
                    name: student.name,
                    program: student.program,
                    presentCount: 0,
                    lateCount: 0,
                    attendanceHistory: []
                });
            }
            
            localStorage.setItem(key, JSON.stringify(students));
            return true;
        } catch (e) {
            console.error('Error saving student:', e);
            return false;
        }
    }

    // Delete student
    function deleteStudent(student) {
        const key = student.storageKey;
        try {
            const students = JSON.parse(localStorage.getItem(key)) || [];
            const filtered = students.filter(s => s.id !== student.id);
            localStorage.setItem(key, JSON.stringify(filtered));
            return true;
        } catch (e) {
            console.error('Error deleting student:', e);
            return false;
        }
    }

    // Render students table
    function renderStudents(students = null) {
        const tbody = document.getElementById('admin-student-list');
        const studentCount = document.getElementById('student-count');
        
        if (students === null) {
            students = getAllStudents();
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
    document.getElementById('add-student-btn').addEventListener('click', () => {
        const name = document.getElementById('student-name').value.trim();
        const course = document.getElementById('student-course').value.trim();
        
        if (!name || !course) {
            alert('Please enter both student name and course.');
            return;
        }
        
        // Create a student ID from the name
        const studentId = name.replace(/\s+/g, '_').toUpperCase();
        
        // Add to admin's student database
        const adminKey = 'allStudents_admin@gmail.com';
        const students = JSON.parse(localStorage.getItem(adminKey)) || [];
        
        // Check if student already exists
        if (students.find(s => s.id === studentId)) {
            alert('A student with this name already exists!');
            return;
        }
        
        students.push({
            id: studentId,
            name: name,
            program: course,
            presentCount: 0,
            lateCount: 0,
            attendanceHistory: []
        });
        
        localStorage.setItem(adminKey, JSON.stringify(students));
        
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
    
    function handleEdit(e) {
        const studentId = e.currentTarget.dataset.id;
        const owner = e.currentTarget.dataset.owner;
        
        const students = getAllStudents();
        currentEditStudent = students.find(s => s.id === studentId && s.owner === owner);
        
        if (!currentEditStudent) {
            alert('Student not found!');
            return;
        }
        
        document.getElementById('edit-student-name').value = currentEditStudent.name;
        document.getElementById('edit-student-course').value = currentEditStudent.program;
        document.getElementById('edit-modal').style.display = 'flex';
    }

    document.getElementById('save-edit-btn').addEventListener('click', () => {
        if (!currentEditStudent) return;
        
        const newName = document.getElementById('edit-student-name').value.trim();
        const newCourse = document.getElementById('edit-student-course').value.trim();
        
        if (!newName || !newCourse) {
            alert('Please enter both name and course.');
            return;
        }
        
        currentEditStudent.name = newName;
        currentEditStudent.program = newCourse;
        
        if (saveStudent(currentEditStudent)) {
            document.getElementById('edit-modal').style.display = 'none';
            renderStudents();
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
    function handleDelete(e) {
        const studentId = e.currentTarget.dataset.id;
        const owner = e.currentTarget.dataset.owner;
        
        const students = getAllStudents();
        const student = students.find(s => s.id === studentId && s.owner === owner);
        
        if (!student) {
            alert('Student not found!');
            return;
        }
        
        if (confirm(`Are you sure you want to delete ${student.name}? This action cannot be undone.`)) {
            if (deleteStudent(student)) {
                renderStudents();
                showNotification('Student deleted successfully!', 'success');
            } else {
                alert('Error deleting student. Please try again.');
            }
        }
    }

    // Search functionality
    document.getElementById('search-student').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            renderStudents();
            return;
        }
        
        const allStudents = getAllStudents();
        const filtered = allStudents.filter(student => 
            student.name.toLowerCase().includes(searchTerm) ||
            student.program.toLowerCase().includes(searchTerm) ||
            student.id.toLowerCase().includes(searchTerm)
        );
        
        renderStudents(filtered);
    });

    // Refresh list
    document.getElementById('refresh-list-btn').addEventListener('click', () => {
        document.getElementById('search-student').value = '';
        renderStudents();
        showNotification('List refreshed!', 'info');
    });

    // Logout
    document.getElementById('admin-logout-btn').addEventListener('click', () => {
        localStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
    });

    // Export to JSON file
    document.getElementById('export-json-btn').addEventListener('click', () => {
        try {
            // Get all student data from localStorage
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

            // Also include NFC registry if it exists
            const nfcRegistry = localStorage.getItem('nfcRegistry');
            if (nfcRegistry) {
                exportData.nfcRegistry = JSON.parse(nfcRegistry);
            }

            // Convert to JSON string
            const jsonString = JSON.stringify(exportData, null, 2);
            
            // Create blob and download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `USM_Students_Backup_${new Date().toISOString().split('T')[0]}.json`;
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

    document.getElementById('import-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            showNotification('Please select a valid JSON file', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
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

                // Import student databases
                let importedCount = 0;
                for (const [owner, students] of Object.entries(importData.students)) {
                    const key = `allStudents_${owner}`;
                    
                    // Get existing students
                    const existing = JSON.parse(localStorage.getItem(key)) || [];
                    
                    // Merge: avoid duplicates based on student ID
                    const existingIds = new Set(existing.map(s => s.id));
                    const newStudents = students.filter(s => !existingIds.has(s.id));
                    
                    // Save merged data
                    const merged = [...existing, ...newStudents];
                    localStorage.setItem(key, JSON.stringify(merged));
                    importedCount += newStudents.length;
                }

                // Import NFC registry if present
                if (importData.nfcRegistry) {
                    const existingNFC = JSON.parse(localStorage.getItem('nfcRegistry')) || {};
                    const mergedNFC = { ...existingNFC, ...importData.nfcRegistry };
                    localStorage.setItem('nfcRegistry', JSON.stringify(mergedNFC));
                }

                // Refresh display
                renderStudents();
                showNotification(`Successfully imported ${importedCount} new students!`, 'success');
                
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

    // Initial render
    renderStudents();
})();
