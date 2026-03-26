/**
 * SecureCheck Pro - Phase 3 Multithreaded Engine with Confidence Metric
 * Off-thread detection engine with probabilistic scoring.
 */

const CONFIG = {
    BRANDS: ['google', 'facebook', 'instagram', 'twitter', 'paypal', 'amazon', 'microsoft', 'apple', 'netflix', 'youtube', 'whatsapp', 'linkedin', 'snapchat', 'tiktok', 'gmail', 'outlook', 'dropbox', 'github'],
    OWASP: {
        BROKEN_ACCESS: 'A01:2021 Broken Access Control', CRYPTO: 'A02:2021 Cryptographic Failures',
        INJECTION: 'A03:2021 Injection', CONFIG: 'A05:2021 Security Misconfiguration',
        VULN_COMP: 'A06:2021 Vulnerable Components', ID_FAILURE: 'A07:2021 Identification Failures',
        INTEGRITY: 'A08:2021 Software and Data Integrity Failures', XSS: 'A07:2021 XSS'
    }
};

const HOMOGLYPHS = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'ѕ': 's', 'і': 'i', 'ј': 'j', 'ԁ': 'd', 'ɡ': 'g', 'ο': 'o', 'α': 'a', 'ρ': 'p', 'ν': 'v', 'ω': 'w', '0': 'o', '1': 'l', '|': 'l' };

const VULNERABLE_LIBS = [
    { pattern: /jquery\/[0-2]\./i, name: 'Legacy jQuery', issue: 'Known XSS vulnerabilities', score: 80 },
    { pattern: /bootstrap\/3\./i, name: 'Bootstrap 3.x', issue: 'Security EOL', score: 75 },
    { pattern: /angular\/1\./i, name: 'AngularJS 1.x', issue: 'Cryptographic weaknesses', score: 85 },
    { pattern: /lodash\/4\.17\.[0-1]/i, name: 'Outdated Lodash', issue: 'Prototype pollution', score: 82 }
];

self.onmessage = function(e) {
    const { input, mode } = e.data;
    const results = runScan(input, mode);
    results.scanDuration = Math.round(performance.now()); // Replaced within main thread in script.js
    self.postMessage(results);
};

function runScan(input, mode) {
    const issues = [], warnings = [], passed = [], flaggedMatches = [];
    const lowInput = input.toLowerCase();

    // 1. Homoglyphs
    const homoglyphResult = checkHomoglyphs(input);
    if (homoglyphResult.found) {
        issues.push({ level: 'risky', message: 'Unicode homoglyph attack detected', cat: CONFIG.OWASP.ID_FAILURE, suggestion: 'Unicode lookalikes used to impersonate domains.', details: `Decoded: ${homoglyphResult.decoded}`, conf: 87, id: 'homo_1' });
        flaggedMatches.push(...homoglyphResult.matches);
    } else passed.push("No homoglyph patterns detected");

    if (mode === 'url') {
        const punyResult = checkPunycode(input);
        if (punyResult.isPunycode) {
            const isPhishing = CONFIG.BRANDS.some(brand => punyResult.decoded.includes(brand));
            if (isPhishing) issues.push({ level: 'risky', message: `IDN phishing attempt — impersonating ${punyResult.decoded}`, cat: CONFIG.OWASP.ID_FAILURE, suggestion: 'Avoid IDNs that mimic brands.', conf: 78, id: 'puny_phish' });
            else warnings.push({ level: 'warn', message: `IDN name detected: ${punyResult.decoded}`, cat: CONFIG.OWASP.ID_FAILURE, suggestion: 'Verify encoded xn-- domains carefully.', conf: 75, id: 'puny_warn' });
        } else passed.push("Standard ASCII domain encoding");

        const redirectResult = checkOpenRedirect(input);
        if (redirectResult.level === 'risky') issues.push({ ...redirectResult, conf: 89, id: 'redir_1' });
        else if (redirectResult.level === 'warn') warnings.push({ ...redirectResult, conf: 35, id: 'redir_2' });

        if (lowInput.startsWith('http://')) issues.push({ level: 'risky', message: 'Insecure HTTP Protocol', cat: CONFIG.OWASP.CRYPTO, suggestion: 'Upgrade to TLS 1.3/HTTPS.', conf: 98, id: 'protocol_1' });
        else if (lowInput.startsWith('https://')) passed.push("Secure HTTPS Protocol");

        const suspiciousTLDs = ['.xyz', '.tk', '.pw', '.ru', '.cn', '.zip', '.top'];
        suspiciousTLDs.forEach(tld => { if (lowInput.includes(tld)) warnings.push({ level: 'warn', message: `Suspicious TLD (${tld})`, cat: CONFIG.OWASP.CONFIG, suggestion: 'Check domain history.', conf: 65, id: 'tld_1' }); });

    } else {
        const protoResult = checkPrototypePollution(input);
        if (protoResult.level === 'risky') issues.push({ ...protoResult, conf: 93, id: 'proto_1' });
        else if (protoResult.level === 'warn') warnings.push({ ...protoResult, conf: 32, id: 'proto_2' });

        const sriResult = checkSRI(input);
        sriResult.warnings.forEach(w => warnings.push({ ...w, conf: 68, id: 'sri_1' }));
        passed.push(...sriResult.passed);

        if (/<script/i.test(input)) issues.push({ level: 'risky', message: 'Inline <script> tag detected', cat: CONFIG.OWASP.XSS, suggestion: 'Use external JS only.', conf: 88, id: 'inline_js' });
        if (/eval\s*\(/i.test(input)) issues.push({ level: 'risky', message: 'Dangerous eval() usage', cat: CONFIG.OWASP.INJECTION, suggestion: 'Replace with JSON logic.', conf: 95, id: 'eval_1' });
        if (/document\.cookie/i.test(input)) issues.push({ level: 'risky', message: 'Sensitive cookie exposure', cat: CONFIG.OWASP.CRYPTO, suggestion: 'Restrict cookie access via HttpOnly.', conf: 92, id: 'cookie_1' });
    }

    const traversalResult = checkPathTraversal(input);
    if (traversalResult.level === 'risky') issues.push({ ...traversalResult, conf: 91, id: 'path_1' });
    else if (traversalResult.level === 'warn') warnings.push({ ...traversalResult, conf: 45, id: 'path_2' });

    VULNERABLE_LIBS.forEach(lib => { if (lib.pattern.test(input)) issues.push({ level: 'risky', message: `Legacy: ${lib.name}`, cat: CONFIG.OWASP.INTEGRITY, suggestion: lib.issue, conf: lib.score, id: 'lib_1' }); });

    let score = 100;
    issues.forEach(i => score -= 25);
    warnings.forEach(w => score -= 10);
    score = Math.max(0, Math.min(100, score));

    const totalConf = [...issues, ...warnings].reduce((acc, curr) => acc + (curr.conf || 0), 0);
    const avgConf = (issues.length + warnings.length) > 0 ? Math.round(totalConf / (issues.length + warnings.length)) : 100;

    return { issues, warnings, passed, score, status: score < 50 ? 'risky' : (score < 85 ? 'caution' : 'safe'), flaggedMatches, decodedInput: homoglyphResult.decoded || input, confidence: avgConf };
}

function checkHomoglyphs(input) {
    let decoded = "", found = false; const matches = [];
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (HOMOGLYPHS[char]) {
            decoded += HOMOGLYPHS[char]; found = true;
            matches.push({ index: i, char: char, target: HOMOGLYPHS[char], code: `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}` });
        } else decoded += char;
    }
    return { found, decoded, matches };
}

function checkPunycode(input) {
    try {
        const url = new URL(input.startsWith('http') ? input : 'https://' + input);
        if (url.hostname.includes('xn--')) return { isPunycode: true, decoded: url.hostname };
    } catch(e) {}
    return { isPunycode: false };
}

function checkPathTraversal(input) {
    const risky = [/\.\.%2f/i, /\.\.%5c/i, /\/etc\/(passwd|shadow)/i, /\/proc\/self\/environ/i, /%00/i, /\.\.\.\.\/\//i];
    for (const p of risky) if (p.test(input)) return { level: 'risky', message: 'Path traversal pattern detected', cat: CONFIG.OWASP.BROKEN_ACCESS, suggestion: 'Sanitize file paths.' };
    if (/\.\.\//.test(input)) return { level: 'warn', message: 'Relative path traversal notation', cat: CONFIG.OWASP.BROKEN_ACCESS, suggestion: 'Verify paths.' };
    return { level: 'none' };
}

function checkOpenRedirect(input) {
    try {
        const url = new URL(input.startsWith('http') ? input : 'https://' + input);
        const params = ['redirect', 'return', 'next', 'url', 'goto', 'dest'];
        for (const p of params) {
            const val = url.searchParams.get(p);
            if (val && (val.startsWith('http') || val.startsWith('//'))) return { level: 'risky', message: `Open redirect in parameter '${p}'`, cat: CONFIG.OWASP.BROKEN_ACCESS, suggestion: 'Use internal allowlists.' };
        }
    } catch(e) {}
    return { level: 'none' };
}

function checkPrototypePollution(input) {
    if (/__proto__|constructor\.prototype|prototype\[/.test(input)) return { level: 'risky', message: 'Prototype pollution manipulation', cat: CONFIG.OWASP.INTEGRITY, suggestion: 'Freeze Object.prototype.' };
    if (/Object\.assign\(|JSON\.parse\(/.test(input)) return { level: 'warn', message: 'Potential prototype pollution vector', cat: CONFIG.OWASP.INTEGRITY, suggestion: 'Validate merge inputs.' };
    return { level: 'none' };
}

function checkSRI(input) {
    const warnings = [], passed = [], cdns = ['cdn.', 'cdnjs.', 'unpkg.', 'jsdelivr.'];
    const tags = input.match(/<(script|link)[^>]+>/gi) || [];
    tags.forEach(tag => {
        const src = tag.match(/(src|href)=["']([^"']+)["']/i);
        if (src) {
            const path = src[2];
            if (cdns.some(cdn => path.includes(cdn)) || path.startsWith('http')) {
                if (!/integrity=/i.test(tag)) warnings.push({ level: 'warn', message: `External resource without SRI: ${path.substring(0, 30)}...`, cat: CONFIG.OWASP.INTEGRITY, suggestion: 'Add integrity hashes.' });
                else passed.push(`SRI verified: ${path.substring(0, 20)}...`);
            }
        }
    });
    return { warnings, passed };
}
