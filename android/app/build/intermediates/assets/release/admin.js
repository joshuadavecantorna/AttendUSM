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
    let tempClassStudents = [];
    let editingClassId = null;

    const classNameInput = document.getElementById('class-name-input');
    const classStudentTempList = document.getElementById('class-student-temp-list');
    const existingClassesList = document.getElementById('existing-classes-list');
    const saveClassBtn = document.getElementById('save-class-btn');
    const resetClassBtn = document.getElementById('reset-class-btn');
    const openStudentSelectorBtn = document.getElementById('open-student-selector-btn');
    const studentSelectorModal = document.getElementById('student-selector-modal');
    const studentSearchInput = document.getElementById('student-search-input');
    const studentSelectorList = document.getElementById('student-selector-list');
    const selectAllStudentsCheckbox = document.getElementById('select-all-students');
    const confirmStudentSelectorBtn = document.getElementById('confirm-student-selector');
    const cancelStudentSelectorBtn = document.getElementById('cancel-student-selector');
    const closeStudentSelectorBtn = document.getElementById('close-student-selector');
    const selectedStudentsCount = document.getElementById('selected-students-count');
    const modalSelectedCount = document.getElementById('modal-selected-count');
    
    let allStudentsForSelection = [];
    let selectedStudentIds = new Set();
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
                    renderClasses();
                } catch (error) {
                    showNotification('Migration failed: ' + error.message, 'error');
                }
            }
        } else {
            renderStudents();
            renderClasses();
        }
    }).catch(error => {
        console.error('Failed to initialize IndexedDB:', error);
        showNotification('Database initialization failed. Falling back to localStorage.', 'error');
    });

    function getStudentsFromLocalStorage() {
        const allStudents = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);

            if (key && key.startsWith('allStudents_')) {
                try {
                    const students = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(students)) {
                        const owner = key.replace('allStudents_', '');
                        students.forEach(student => {
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

    function generateSlug(value) {
        return value
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function generateClassId(className) {
        const nameSlug = generateSlug(className);
        const timestamp = Date.now();
        return `${nameSlug}_${timestamp}`;
    }

    function renderTempClassStudents() {
        if (!classStudentTempList) return;

        if (!tempClassStudents.length) {
            classStudentTempList.innerHTML = `
                <tr>
                    <td colspan="4" style="padding: 1.25rem; text-align: center; color: var(--text-light);">
                        No students added yet.
                    </td>
                </tr>
            `;
            return;
        }

        classStudentTempList.innerHTML = tempClassStudents.map(student => `
            <tr>
                <td style="padding: 0.75rem; font-family: monospace;">${student.id}</td>
                <td style="padding: 0.75rem;">${student.name}</td>
                <td style="padding: 0.75rem;">${student.program || 'N/A'}</td>
                <td style="padding: 0.5rem; text-align: center;">
                    <button class="btn btn-outline remove-class-student-btn" data-student-id="${student.id}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
                        Remove
                    </button>
                </td>
            </tr>
        `).join('');
        updateSelectedStudentsCount();
    }

    function resetClassBuilder() {
        tempClassStudents = [];
        editingClassId = null;
        selectedStudentIds.clear();
        if (classNameInput) classNameInput.value = '';
        renderTempClassStudents();
        updateSelectedStudentsCount();
    }

    function populateClassBuilder(classData) {
        editingClassId = classData.classId;
        if (classNameInput) classNameInput.value = classData.name || '';
        tempClassStudents = Array.isArray(classData.students)
            ? classData.students.map(student => ({
                id: student.id,
                name: student.name,
                program: student.program || '',
                presentCount: student.presentCount || 0,
                lateCount: student.lateCount || 0,
                attendanceHistory: student.attendanceHistory || []
            }))
            : [];
        renderTempClassStudents();
        updateSelectedStudentsCount();
    }

    async function loadClasses() {
        if (!dbReady) {
            console.warn('Database not ready');
            return [];
        }

        try {
            const classes = await attendanceDB.getAllClasses();
            return Array.isArray(classes) ? classes : [];
        } catch (error) {
            console.error('Error loading classes:', error);
            return [];
        }
    }

    async function renderClasses() {
        if (!existingClassesList) return;

        const classes = await loadClasses();

        if (!classes.length) {
            existingClassesList.innerHTML = `
                <tr>
                    <td colspan="4" style="padding: 1.25rem; text-align: center; color: var(--text-light);">
                        No classes created yet.
                    </td>
                </tr>
            `;
            return;
        }

        classes.sort((a, b) => a.name.localeCompare(b.name));

        existingClassesList.innerHTML = classes.map(cls => `
            <tr>
                <td style="padding: 0.75rem;">${cls.name}</td>
                <td style="padding: 0.75rem; text-align: center;">${(cls.students || []).length}</td>
                <td style="padding: 0.5rem; text-align: center;">
                    <div style="display: flex; gap: 0.4rem; justify-content: center;">
                        <button class="btn btn-outline edit-class-btn" data-class-id="${cls.classId}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
                            Edit
                        </button>
                        <button class="btn btn-outline delete-class-btn" data-class-id="${cls.classId}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; color: var(--danger); border-color: var(--danger);">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderTempClassStudents();

    function buildStudentId(name, providedId) {
        if (providedId && providedId.trim().length) {
            return providedId.trim().toUpperCase();
        }
        return name
            .trim()
            .replace(/\s+/g, '_')
            .toUpperCase();
    }

    async function loadAllStudentsForSelection() {
        if (!dbReady) {
            console.warn('Database not ready');
            return [];
        }
        
        try {
            const students = await attendanceDB.getAllStudents();
            return students;
        } catch (error) {
            console.error('Error loading students:', error);
            return [];
        }
    }

    async function renderStudentSelector() {
        if (!studentSelectorList) return;
        
        allStudentsForSelection = await loadAllStudentsForSelection();
        
        if (!allStudentsForSelection.length) {
            studentSelectorList.innerHTML = `
                <tr>
                    <td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-light);">
                        No students found in database. Students will be added when they scan their QR codes.
                    </td>
                </tr>
            `;
            return;
        }
        
        filterAndRenderStudents();
    }

    function filterAndRenderStudents() {
        const searchTerm = (studentSearchInput?.value || '').toLowerCase().trim();
        const filtered = allStudentsForSelection.filter(student => {
            if (!searchTerm) return true;
            const name = (student.name || '').toLowerCase();
            const id = (student.id || '').toLowerCase();
            const program = (student.program || '').toLowerCase();
            return name.includes(searchTerm) || id.includes(searchTerm) || program.includes(searchTerm);
        });

        if (!filtered.length) {
            studentSelectorList.innerHTML = `
                <tr>
                    <td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-light);">
                        No students match your search.
                    </td>
                </tr>
            `;
            return;
        }

        studentSelectorList.innerHTML = filtered.map(student => {
            const isSelected = selectedStudentIds.has(student.id);
            return `
                <tr style="cursor: pointer;" onclick="toggleStudentSelection('${student.id}')">
                    <td style="padding: 0.75rem; text-align: center;">
                        <input type="checkbox" 
                               data-student-id="${student.id}" 
                               ${isSelected ? 'checked' : ''} 
                               onclick="event.stopPropagation(); toggleStudentSelection('${student.id}')"
                               style="cursor: pointer;">
                    </td>
                    <td style="padding: 0.75rem;">${student.id || ''}</td>
                    <td style="padding: 0.75rem;">${student.name || ''}</td>
                    <td style="padding: 0.75rem;">${student.program || ''}</td>
                </tr>
            `;
        }).join('');

        updateModalSelectedCount();
    }

    window.toggleStudentSelection = function(studentId) {
        if (selectedStudentIds.has(studentId)) {
            selectedStudentIds.delete(studentId);
        } else {
            selectedStudentIds.add(studentId);
        }
        
        const checkbox = document.querySelector(`input[data-student-id="${studentId}"]`);
        if (checkbox) {
            checkbox.checked = selectedStudentIds.has(studentId);
        }
        
        updateModalSelectedCount();
    };

    function updateModalSelectedCount() {
        const count = selectedStudentIds.size;
        if (modalSelectedCount) {
            modalSelectedCount.textContent = count;
        }
        if (selectAllStudentsCheckbox) {
            const visibleCheckboxes = document.querySelectorAll('input[data-student-id]');
            const allVisibleSelected = visibleCheckboxes.length > 0 && 
                Array.from(visibleCheckboxes).every(cb => selectedStudentIds.has(cb.dataset.studentId));
            selectAllStudentsCheckbox.checked = allVisibleSelected;
        }
    }

    function updateSelectedStudentsCount() {
        if (selectedStudentsCount) {
            selectedStudentsCount.textContent = tempClassStudents.length;
        }
    }

    function handleConfirmStudentSelection() {
        const selectedStudents = allStudentsForSelection.filter(s => selectedStudentIds.has(s.id));
        
        selectedStudents.forEach(student => {
            const existingIndex = tempClassStudents.findIndex(s => s.id === student.id);
            if (existingIndex < 0) {
                tempClassStudents.push({
                    id: student.id,
                    name: student.name,
                    program: student.program || '',
                    presentCount: student.presentCount || 0,
                    lateCount: student.lateCount || 0,
                    attendanceHistory: student.attendanceHistory || []
                });
            }
        });

        renderTempClassStudents();
        updateSelectedStudentsCount();
        closeStudentSelectorModal();
    }

    function openStudentSelectorModal() {
        if (!studentSelectorModal) return;
        selectedStudentIds.clear();
        tempClassStudents.forEach(s => selectedStudentIds.add(s.id));
        studentSelectorModal.style.display = 'flex';
        renderStudentSelector();
    }

    function closeStudentSelectorModal() {
        if (!studentSelectorModal) return;
        studentSelectorModal.style.display = 'none';
        if (studentSearchInput) studentSearchInput.value = '';
    }

    async function handleSaveClass() {
        const className = (classNameInput?.value || '').trim();

        if (!className) {
            showNotification('Please enter a class name.', 'error');
            return;
        }

        if (tempClassStudents.length === 0) {
            showNotification('Add at least one student to the class before saving.', 'error');
            return;
        }

        if (!dbReady) {
            showNotification('Database not ready. Please wait a moment and try again.', 'error');
            return;
        }

        // Verify database is accessible
        if (!attendanceDB.db) {
            showNotification('Database connection lost. Please refresh the page.', 'error');
            return;
        }

        const timestamp = new Date().toISOString();
        const classId = editingClassId || generateClassId(className);
        let existingClass = null;

        if (editingClassId) {
            try {
                existingClass = await attendanceDB.getClass(editingClassId);
            } catch (err) {
                console.warn('Could not load existing class:', err);
            }
        }

        const classStudents = tempClassStudents.map(student => ({
            ...student,
            classId,
            className
        }));

        const classRecord = {
            classId,
            name: className,
            students: classStudents,
            createdAt: existingClass?.createdAt || timestamp,
            updatedAt: timestamp
        };

        try {
            // Verify classes store exists
            if (!attendanceDB.db.objectStoreNames.contains('classes')) {
                showNotification('Classes store not found. Please refresh the page to initialize the database.', 'error');
                return;
            }

            // Save the class first
            await attendanceDB.addClass(classRecord);
            console.log('Class saved successfully:', classRecord);

            // Update students with class information (don't fail if student update fails)
            const studentUpdateErrors = [];
            for (const student of classStudents) {
                try {
                    // Get existing student if it exists
                    const existingStudent = await attendanceDB.getStudent(student.id);
                    
                    // Merge with existing data, preserving owner if it exists
                    const studentData = {
                        id: student.id,
                        name: student.name,
                        program: student.program,
                        classId: classId,
                        className: className,
                        presentCount: student.presentCount || existingStudent?.presentCount || 0,
                        lateCount: student.lateCount || existingStudent?.lateCount || 0,
                        absentCount: student.absentCount || existingStudent?.absentCount || 0,
                        attendanceHistory: student.attendanceHistory || existingStudent?.attendanceHistory || []
                    };
                    
                    // Preserve owner if it exists on the existing student
                    if (existingStudent?.owner) {
                        studentData.owner = existingStudent.owner;
                    }
                    
                    await attendanceDB.addStudent(studentData);
                } catch (studentError) {
                    console.warn(`Failed to update student ${student.id}:`, studentError);
                    studentUpdateErrors.push(student.id);
                }
            }

            if (studentUpdateErrors.length > 0) {
                console.warn('Some students could not be updated:', studentUpdateErrors);
            }

            showNotification(editingClassId ? 'Class updated successfully!' : 'Class created successfully!', 'success');
            resetClassBuilder();
            await renderClasses();
            await renderStudents();
        } catch (error) {
            console.error('Error saving class:', error);
            const errorMessage = error.message || error.toString() || 'Unknown error';
            showNotification(`Failed to save class: ${errorMessage}`, 'error');
        }
    }

    if (openStudentSelectorBtn) {
        openStudentSelectorBtn.addEventListener('click', (event) => {
            event.preventDefault();
            openStudentSelectorModal();
        });
    }

    if (confirmStudentSelectorBtn) {
        confirmStudentSelectorBtn.addEventListener('click', (event) => {
            event.preventDefault();
            handleConfirmStudentSelection();
        });
    }

    if (cancelStudentSelectorBtn) {
        cancelStudentSelectorBtn.addEventListener('click', (event) => {
            event.preventDefault();
            closeStudentSelectorModal();
        });
    }

    if (closeStudentSelectorBtn) {
        closeStudentSelectorBtn.addEventListener('click', (event) => {
            event.preventDefault();
            closeStudentSelectorModal();
        });
    }

    if (studentSearchInput) {
        studentSearchInput.addEventListener('input', () => {
            filterAndRenderStudents();
        });
    }

    if (selectAllStudentsCheckbox) {
        selectAllStudentsCheckbox.addEventListener('change', (e) => {
            const visibleCheckboxes = document.querySelectorAll('input[data-student-id]');
            const shouldSelect = e.target.checked;
            visibleCheckboxes.forEach(cb => {
                const studentId = cb.dataset.studentId;
                if (shouldSelect) {
                    selectedStudentIds.add(studentId);
                } else {
                    selectedStudentIds.delete(studentId);
                }
                cb.checked = shouldSelect;
            });
            updateModalSelectedCount();
        });
    }

    if (resetClassBtn) {
        resetClassBtn.addEventListener('click', (event) => {
            event.preventDefault();
            resetClassBuilder();
        });
    }

    if (saveClassBtn) {
        saveClassBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            await handleSaveClass();
        });
    }

    if (classStudentTempList) {
        classStudentTempList.addEventListener('click', (event) => {
            const button = event.target.closest('.remove-class-student-btn');
            if (!button) return;

            event.preventDefault();
            const studentId = button.dataset.studentId;
            tempClassStudents = tempClassStudents.filter(student => student.id !== studentId);
            renderTempClassStudents();
            updateSelectedStudentsCount();
        });
    }

    if (existingClassesList) {
        existingClassesList.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-class-id]');
            if (!button) return;

            event.preventDefault();
            const classId = button.dataset.classId;

            if (button.classList.contains('edit-class-btn')) {
                if (!dbReady) {
                    showNotification('Database not ready yet. Please try again in a moment.', 'error');
                    return;
                }

                const classData = await attendanceDB.getClass(classId);
                if (!classData) {
                    showNotification('Selected class could not be found.', 'error');
                    return;
                }

                populateClassBuilder(classData);
                showNotification(`Loaded ${classData.name} for editing. Remember to click Save Class after updates.`, 'info');
            } else if (button.classList.contains('delete-class-btn')) {
                if (!confirm('Are you sure you want to delete this class? Student records will remain in the roster.')) {
                    return;
                }

                if (!dbReady) {
                    showNotification('Database not ready yet. Please try again in a moment.', 'error');
                    return;
                }

                try {
                    await attendanceDB.deleteClass(classId);
                    if (editingClassId === classId) {
                        resetClassBuilder();
                    }
                    await renderClasses();
                    showNotification('Class deleted successfully.', 'success');
                } catch (error) {
                    console.error('Error deleting class:', error);
                    showNotification('Failed to delete class. Please try again.', 'error');
                }
            }
        });
    }


    // Get all students from IndexedDB
    async function getAllStudents() {
        if (!dbReady) {
            console.warn('Database not ready');
            return getStudentsFromLocalStorage();
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
            return getStudentsFromLocalStorage();
        }
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
                classId: student.classId || null,
                className: student.className || null,
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
                    <td colspan="7" style="padding: 3rem; text-align: center; color: var(--text-light);">
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
                <td style="padding: 1rem; color: var(--text);">${student.className || '—'}</td>
                <td style="padding: 1rem; color: var(--text);">
                    <span style="background: var(--light); padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.9rem;">
                        ${student.program || '—'}
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

    // Settings: Late Threshold
    const lateThresholdInput = document.getElementById('late-threshold-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    // Load late threshold setting on page load
    function loadLateThresholdSetting() {
        const savedThreshold = localStorage.getItem('lateThresholdMinutes');
        if (savedThreshold) {
            lateThresholdInput.value = savedThreshold;
        } else {
            // Default to 15 minutes
            lateThresholdInput.value = 15;
        }
    }

    // Save late threshold setting
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const threshold = parseInt(lateThresholdInput.value);
            
            if (isNaN(threshold) || threshold < 1 || threshold > 120) {
                showNotification('Please enter a valid number between 1 and 120 minutes.', 'error');
                return;
            }

            localStorage.setItem('lateThresholdMinutes', threshold.toString());
            showNotification(`Late threshold set to ${threshold} minutes. This will apply to all new attendance scans.`, 'success');
        });
    }

    // Load settings when page loads
    loadLateThresholdSetting();

    // Show notification on page load if there's existing data
    if (localStorage.getItem('loggedInUser')) {
        console.log('Admin panel loaded for user:', localStorage.getItem('loggedInUser'));
    }
})();
