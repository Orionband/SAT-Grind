    const quizContainer = document.getElementById('quizContainer');
    const resultsContainer = document.getElementById('resultsContainer');
    const mainScreen = document.getElementById('mainScreen');
    const questionNavigator = document.getElementById('questionNavigator');

    let readingQuestions = [];
    let mathQuestions = [];
    let currentQuizQuestions = [];
    let quizHistory = [];
    let bookmarkedQuestions = [];
    let chartInstances = {};
    let quizTimerInterval;
    let quizStartTime;
    let currentSubject = ''; // 'Reading' or 'Math'
    
    function setUIView(view) {
        if (view === 'quiz') {
            mainScreen.classList.add('hidden');
            quizContainer.classList.remove('hidden');
            questionNavigator.classList.remove('hidden');
            resultsContainer.innerHTML = '';
        } else { // 'main' view
            mainScreen.classList.remove('hidden');
            quizContainer.classList.add('hidden');
            questionNavigator.add('hidden');
            quizContainer.innerHTML = ''; 
            resultsContainer.innerHTML = '';
            document.getElementById('navigatorList').innerHTML = ''; 
            document.getElementById('timerDisplay').textContent = 'Time: 00:00';
            document.getElementById('optionsContainer').classList.add('hidden');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        setUIView('main');
        Chart.register(ChartDataLabels);
        loadDataFromStorage();
        loadQuestions();
        
        document.querySelectorAll('.subject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentSubject = e.target.dataset.subject;
                setupOptionsPanel();
            });
        });
        
        document.getElementById('qotdBtn').addEventListener('click', startQuestionOfTheDay);
        document.getElementById('startBtn').addEventListener('click', loadAndDisplayQuiz);
        document.getElementById('clearDataBtn').addEventListener('click', clearAllData);

        // Add event listeners to option selectors to update question count dynamically
        ['modeSelect', 'difficultySelect', 'categorySelect'].forEach(id => {
            document.getElementById(id).addEventListener('change', updateMaxQuestions);
        });
    });
    
    function getChartThemeOptions() {
        return { 
            color: '#212529', 
            grid: { color: 'rgba(0, 0, 0, 0.1)' }, 
            ticks: { color: '#212529' } 
        };
    }
    
    function loadDataFromStorage() {
        quizHistory = JSON.parse(localStorage.getItem('satQuizHistory_v2')) || [];
        bookmarkedQuestions = JSON.parse(localStorage.getItem('satBookmarkedQuestions_v2')) || [];
    }
    function saveDataToStorage() {
        localStorage.setItem('satQuizHistory_v2', JSON.stringify(quizHistory));
        localStorage.setItem('satBookmarkedQuestions_v2', JSON.stringify(bookmarkedQuestions));
    }
    function clearAllData() {
        if (confirm("Are you sure? This will erase all your SAT progress.")) {
            quizHistory = [];
            bookmarkedQuestions = [];
            saveDataToStorage();
            renderDashboard();
            updateMaxQuestions();
            alert("All study data has been cleared.");
        }
    }

    function setupOptionsPanel() {
        document.getElementById('optionsContainer').classList.remove('hidden');
        document.getElementById('optionsHeader').textContent = `Practice Options for ${currentSubject}`;
        populateCategoryFilterForSubject();
        updateMaxQuestions();
    }

    function populateCategoryFilterForSubject() {
        const questionPool = currentSubject === 'Math' ? mathQuestions : readingQuestions;
        const domains = [...new Set(questionPool.map(q => q.cat))].sort();
        const selectElement = document.getElementById('categorySelect');
        selectElement.innerHTML = '<option value="ALL">All Topics</option>';
        domains.forEach(domain => {
            if (!domain) return;
            const optionItem = document.createElement('option');
            optionItem.value = domain;
            optionItem.textContent = domain;
            selectElement.appendChild(optionItem);
        });
    }

    function getMistakeQuestionIds() {
        const mistakeIds = new Set();
        quizHistory.forEach(quiz => {
            quiz.questions.forEach(q => {
                if (!q.isCorrect) mistakeIds.add(q.questionId);
            });
        });
        return Array.from(mistakeIds);
    }

    function updateMaxQuestions() {
        if (!currentSubject) return; // Don't run if a subject hasn't been chosen yet
        const mode = document.getElementById('modeSelect').value;
        const difficulty = document.getElementById('difficultySelect').value;
        const category = document.getElementById('categorySelect').value;
        const numInput = document.getElementById('numQuestions');
        const startBtn = document.getElementById('startBtn');
        let basePool = currentSubject === 'Math' ? mathQuestions : readingQuestions;
        let finalPool = basePool;

        // Filter by mode
        if (mode === 'mistakes') {
            const mistakeIds = getMistakeQuestionIds();
            finalPool = basePool.filter(q => mistakeIds.includes(q.questionId));
        } else if (mode === 'flagged') {
            finalPool = basePool.filter(q => bookmarkedQuestions.includes(q.questionId));
        }
        
        // Filter by category
        if (category !== 'ALL') {
            finalPool = finalPool.filter(q => q.cat === category);
        }

        // Filter by difficulty
        if (difficulty !== 'ALL') {
            finalPool = finalPool.filter(q => q.difficulty === difficulty);
        }

        numInput.max = finalPool.length;
        if (finalPool.length > 0) {
            if (parseInt(numInput.value) > finalPool.length || parseInt(numInput.value) <= 0) {
                 numInput.value = Math.min(10, finalPool.length);
            }
            startBtn.disabled = false;
            startBtn.textContent = 'Start Test';
        } else {
            numInput.value = 0;
            startBtn.disabled = true;
            startBtn.textContent = 'No Questions Available';
        }
    }
    
    function normalizeSatQuestions(data) {
        return data.map(item => ({
            questionId: item.id,
            cat: item.domain,
            difficulty: item.difficulty,
            explanation: item.question.explanation,
            questionText: (item.question.paragraph && item.question.paragraph !== 'null' ? `<p>${item.question.paragraph}</p>` : '') + item.question.question,
            answerType: Object.keys(item.question.choices).length === 0 ? 'FB' : 'MC',
            blanks: Object.keys(item.question.choices).length === 0 ? [item.question.correct_answer] : [],
            answerChoices: Object.keys(item.question.choices).length > 0 
                ? Object.entries(item.question.choices).map(([key, value]) => ({
                    Text: `${key}. ${value}`,
                    IsCorrect: key === item.question.correct_answer
                }))
                : []
        }));
    }
    
    async function loadQuestions() {
        try {
            const [readResponse, mathResponse] = await Promise.all([
                fetch('fullread.json'),
                fetch('fullmath.json')
            ]);
            if (!readResponse.ok || !mathResponse.ok) throw new Error('Network response was not ok.');
            
            const readData = await readResponse.json();
            const mathData = await mathResponse.json();

            readingQuestions = normalizeSatQuestions(readData);
            mathQuestions = normalizeSatQuestions(mathData);
            
            renderDashboard();
            document.querySelectorAll('.subject-btn, #qotdBtn').forEach(btn => btn.disabled = false);

        } catch (error) {
            console.error(`Error fetching question files:`, error);
            mainScreen.innerHTML = `<p style="color: red; text-align: center;">CRITICAL ERROR: Could not load question files (e.g., fullread.json, fullmath.json). Make sure they are in the same directory as this HTML file.</p>`;
        }
    }
    
    function startTimer() {
        const timerDisplay = document.getElementById('timerDisplay');
        if (!timerDisplay) return;
        clearInterval(quizTimerInterval);
        quizStartTime = Date.now();
        timerDisplay.textContent = 'Time: 00:00';
        quizTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - quizStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            timerDisplay.textContent = `Time: ${minutes}:${seconds}`;
        }, 1000);
    }
    
    function startQuestionOfTheDay() {
        const combinedQuestions = [...readingQuestions, ...mathQuestions];
        if (combinedQuestions.length === 0) {
            alert("Questions are still loading or failed to load.");
            return;
        }
        const today = new Date();
        const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const qotdIndex = dayOfYear % combinedQuestions.length;
        
        currentQuizQuestions = [combinedQuestions[qotdIndex]];
        displayQuiz("Question of the Day");
        startTimer();
    }

    function loadAndDisplayQuiz() {
        const numQuestionsInput = document.getElementById('numQuestions');
        const randomize = document.getElementById('randomize').checked;
        const mode = document.getElementById('modeSelect').value;
        const difficulty = document.getElementById('difficultySelect').value;
        const category = document.getElementById('categorySelect').value;
        
        let basePool = currentSubject === 'Math' ? mathQuestions : readingQuestions;
        let finalPool = basePool;

        // Filter by mode
        if (mode === 'mistakes') {
            const mistakeIds = getMistakeQuestionIds();
            finalPool = basePool.filter(q => mistakeIds.includes(q.questionId));
        } else if (mode === 'flagged') {
            finalPool = basePool.filter(q => bookmarkedQuestions.includes(q.questionId));
        }
        
        // Filter by category and difficulty
        if (category !== 'ALL') finalPool = finalPool.filter(q => q.cat === category);
        if (difficulty !== 'ALL') finalPool = finalPool.filter(q => q.difficulty === difficulty);

        if (finalPool.length === 0) {
            alert("There are no questions available for your selected criteria.");
            return;
        }
        const numQuestions = Math.min(parseInt(numQuestionsInput.value), finalPool.length);
        
        currentQuizQuestions = randomize 
            ? [...finalPool].sort(() => Math.random() - 0.5).slice(0, numQuestions)
            : finalPool.slice(0, numQuestions);

        displayQuiz(`${currentSubject} Quiz`);
        startTimer();
    }

    function displayQuiz(title = "Quiz") {
        setUIView('quiz');
        quizContainer.innerHTML = `<h2>${title}</h2>`;
        
        currentQuizQuestions.forEach((q, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question';
            questionDiv.id = `q-${index}`;
            const isBookmarked = bookmarkedQuestions.includes(q.questionId);
            
            const questionHeaderHtml = `
                <div class="question-header">
                    <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="toggleBookmark('${q.questionId}', this, ${index})">🚩</button>
                    <div class="question-text">${index + 1}. ${q.questionText}</div>
                    <div class="question-metadata">
                        <span class="question-category">${q.cat || 'N/A'}</span>
                        <span class="question-difficulty">${q.difficulty || ''}</span>
                    </div>
                </div>`;
            
            let answersHtml = '';
            if (q.answerType === 'MC') {
                q.answerChoices.forEach((choice, choiceIndex) => {
                    answersHtml += `<label class="answer-choice">${choice.Text}<input type="radio" name="question-${index}" value="${choiceIndex}"><span class="checkmark"></span></label>`;
                });
            } else if (q.answerType === 'FB') {
                answersHtml += `<input type="text" class="fb-input" id="fb-input-${index}" autocomplete="off" placeholder="Enter your answer">`;
            }
            
            questionDiv.innerHTML = questionHeaderHtml + answersHtml;
            quizContainer.appendChild(questionDiv);
        });

        const submitButton = document.createElement('button');
        submitButton.id = 'submitBtn';
        submitButton.className = 'submit-btn';
        submitButton.textContent = 'Submit Test';
        submitButton.addEventListener('click', showResults);
        quizContainer.appendChild(submitButton);

        const navigatorList = document.getElementById('navigatorList');
        navigatorList.innerHTML = '';
        currentQuizQuestions.forEach((q, index) => {
            const navBtn = document.createElement('button');
            navBtn.className = 'nav-btn';
            navBtn.innerHTML = `Q ${index + 1}`;
            navBtn.dataset.index = index;
            navBtn.onclick = () => document.getElementById(`q-${index}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (bookmarkedQuestions.includes(q.questionId)) navBtn.classList.add('flagged');
            navigatorList.appendChild(navBtn);
            
            const questionDiv = document.getElementById(`q-${index}`);
            questionDiv.querySelectorAll('input[type="radio"], input.fb-input')
                .forEach(input => input.addEventListener('input', () => navBtn.classList.add('answered')));
        });
    }
    
    function toggleBookmark(questionId, buttonElement, questionIndex) {
        const navBtn = document.querySelector(`.nav-btn[data-index="${questionIndex}"]`);
        const index = bookmarkedQuestions.indexOf(questionId);
        if (index > -1) {
            bookmarkedQuestions.splice(index, 1);
            buttonElement.classList.remove('bookmarked');
            if (navBtn) navBtn.classList.remove('flagged');
        } else {
            bookmarkedQuestions.push(questionId);
            buttonElement.classList.add('bookmarked');
            if (navBtn) navBtn.classList.add('flagged');
        }
        saveDataToStorage();
    }

    function showResults() {
        clearInterval(quizTimerInterval);
        questionNavigator.classList.add('hidden');
        let score = 0;
        const quizAttempt = {
            timestamp: Date.now(),
            score: 0,
            total: currentQuizQuestions.length,
            questions: []
        };
        currentQuizQuestions.forEach((q, index) => {
            let isQuestionCorrect = false;
            if (q.answerType === 'FB') {
                const userInput = document.querySelector(`#fb-input-${index}`);
                if (userInput && userInput.value.trim().toLowerCase() === q.blanks[0].toLowerCase()) {
                    isQuestionCorrect = true;
                }
            } else if (q.answerType === 'MC') {
                const userChoice = document.querySelector(`input[name="question-${index}"]:checked`);
                if (userChoice && q.answerChoices[parseInt(userChoice.value)].IsCorrect) {
                    isQuestionCorrect = true;
                }
            }
            if (isQuestionCorrect) score++;
            quizAttempt.questions.push({ questionId: q.questionId, isCorrect: isQuestionCorrect, category: q.cat });
        });

        quizAttempt.score = score;
        quizHistory.push(quizAttempt);
        saveDataToStorage();
        renderDashboard();

        quizContainer.querySelectorAll('.answer-choice input, .fb-input').forEach(input => input.disabled = true);
        document.getElementById('submitBtn')?.remove();

        const totalTimeSeconds = Math.floor((Date.now() - quizStartTime) / 1000);
        const scorePercentage = currentQuizQuestions.length > 0 ? Math.round((score / currentQuizQuestions.length) * 100) : 0;
        resultsContainer.innerHTML = `<h2>Your Score: ${score}/${currentQuizQuestions.length} (${scorePercentage}%)</h2>
            <div class="chart-summary-container">
                <h3>This Quiz Performance</h3>
                <div class="chart-wrapper"><canvas id="quizSummaryChart"></canvas></div>
            </div>`;
        
        renderQuizSummaryChart(quizAttempt);
        revealAnswers();
        
        const restartBtn = document.createElement('button');
        restartBtn.className = 'restart-btn';
        restartBtn.textContent = 'Back to Main Menu';
        restartBtn.onclick = () => setUIView('main');
        quizContainer.appendChild(restartBtn);
    }
    
    function revealAnswers() {
        currentQuizQuestions.forEach((q, index) => {
            const questionElement = document.getElementById(`q-${index}`);
            if (!questionElement) return;
            questionElement.querySelector('.bookmark-btn')?.style.setProperty('display', 'none', 'important');
            
            const explanationHtml = `<div class="result-explanation">${q.explanation || 'No explanation provided.'}</div>`;
            let answerFeedbackHtml = '';

            if (q.answerType === 'FB') {
                const userInput = questionElement.querySelector(`#fb-input-${index}`);
                if (!userInput) return;
                const isCorrect = userInput.value.trim().toLowerCase() === q.blanks[0].toLowerCase();
                userInput.classList.add(isCorrect ? 'correct' : 'incorrect');
                answerFeedbackHtml = `<strong>Correct Answer:</strong> ${q.blanks[0]}`;
            } else if (q.answerType === 'MC') {
                const userAnswerIndex = document.querySelector(`input[name="question-${index}"]:checked`)?.value;
                questionElement.querySelectorAll('.answer-choice').forEach((label, choiceIndex) => {
                    const isCorrectChoice = q.answerChoices[choiceIndex].IsCorrect;
                    if (isCorrectChoice) label.classList.add('correct');
                    else if (userAnswerIndex && parseInt(userAnswerIndex) === choiceIndex) {
                        label.classList.add('incorrect');
                    }
                });
            }
            questionElement.insertAdjacentHTML('beforeend', explanationHtml.replace('<p>', `<p>${answerFeedbackHtml}<br><br>`));
        });
    }
    
    // Chart rendering functions (largely unchanged but adapted for white theme)
    function renderQuizSummaryChart(quizAttempt) {
        const ctx = document.getElementById('quizSummaryChart')?.getContext('2d');
        if (!ctx) return;
        if (chartInstances.summary) chartInstances.summary.destroy();
        const categoryStats = {};
        quizAttempt.questions.forEach(qResult => {
            const category = qResult.category || 'N/A';
            if (!categoryStats[category]) categoryStats[category] = { correct: 0, total: 0 };
            categoryStats[category].total++;
            if (qResult.isCorrect) categoryStats[category].correct++;
        });
        
        const labels = Object.keys(categoryStats);
        const data = labels.map(cat => (categoryStats[cat].total > 0 ? (categoryStats[cat].correct / categoryStats[cat].total) * 100 : 0));
        const themeOptions = getChartThemeOptions();
        
        chartInstances.summary = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: '% Correct', data, backgroundColor: 'rgba(23, 162, 184, 0.7)', borderColor: 'rgb(23, 162, 184)', borderWidth: 1 }] },
            options: { indexAxis: 'y', scales: { x: { ...themeOptions, beginAtZero: true, max: 100, ticks: { ...themeOptions.ticks, callback: (v) => v + "%" } }, y: { ...themeOptions } }, plugins: { legend: { display: false }, title: { display: false }, datalabels: { anchor: 'end', align: 'end', color: themeOptions.color, font: { weight: 'bold' }, formatter: (v) => v.toFixed(0) + '%' } }, responsive: true, maintainAspectRatio: false }
        });
    }
    
    function renderDashboard() {
        renderCategoryChart();
        renderHistoryChart();
    }

    function renderCategoryChart() {
        const ctx = document.getElementById('categoryChart')?.getContext('2d');
        if (!ctx) return;
        if (chartInstances.category) chartInstances.category.destroy();
        
        const allDomains = [...new Set([...readingQuestions, ...mathQuestions].map(q => q.cat))].sort();
        const categoryStats = {};
        allDomains.forEach(d => categoryStats[d] = { correct: 0, total: 0 });

        quizHistory.forEach(quiz => {
            quiz.questions.forEach(qResult => {
                if(categoryStats[qResult.category]) {
                    categoryStats[qResult.category].total++;
                    if(qResult.isCorrect) categoryStats[qResult.category].correct++;
                }
            });
        });

        const labels = allDomains.filter(d => categoryStats[d].total > 0);
        const data = labels.map(domain => (categoryStats[domain].correct / categoryStats[domain].total) * 100);
        
        const themeOptions = getChartThemeOptions();
        chartInstances.category = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: '% Correct by Topic', data, backgroundColor: 'rgba(0, 123, 255, 0.7)', borderColor: 'rgba(0, 123, 255, 1)', borderWidth: 1 }] }, 
            options: {
                indexAxis: 'y',
                scales: { x: { ...themeOptions, beginAtZero: true, max: 100, ticks: { ...themeOptions.ticks, callback: (v) => v + "%" } }, y: { ...themeOptions } },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Overall Performance by Topic', color: themeOptions.color, font: {size: 16} },
                    datalabels: { anchor: 'end', align: 'end', color: '#343a40', font: { weight: 'bold' }, formatter: v => `${v.toFixed(0)}%` }
                },
                responsive: true, maintainAspectRatio: false
            }
        });
    }

    function renderHistoryChart() {
        const ctx = document.getElementById('historyChart')?.getContext('2d');
        if (!ctx) return;
        if (chartInstances.history) chartInstances.history.destroy();
        const chartData = quizHistory.map(quiz => ({ x: quiz.timestamp, y: quiz.total > 0 ? (quiz.score / quiz.total) * 100 : 0 }));
        const themeOptions = getChartThemeOptions();
        chartInstances.history = new Chart(ctx, {
            type: 'line',
            data: { datasets: [{ label: 'Quiz Score %', data: chartData, fill: true, backgroundColor: 'rgba(40, 167, 69, 0.1)', borderColor: 'rgb(40, 167, 69)', tension: 0.1 }] },
            options: {
                scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' }, title: { display: true, text: 'Date', color: themeOptions.color }, ...themeOptions }, y: { beginAtZero: true, max: 100, title: { display: true, text: 'Score %', color: themeOptions.color }, ...themeOptions } },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Score Over Time', color: themeOptions.color, font: {size: 16} },
                    datalabels: { display: false }
                },
                responsive: true, maintainAspectRatio: false
            }
        });
    }
