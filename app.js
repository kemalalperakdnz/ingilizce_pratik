// Basit veri yapısı:
// word = { id, english, turkish, example, tags, correctCount, wrongCount, lastSeen, createdAt, nextReviewAt, level }
const NOTES_KEY = "kelime_ustasi_personal_notes";

const STORAGE_KEYS = {
    WORDS: "kelime_ustasi_words",
    DAILY: "kelime_ustasi_daily",
    STATS: "kelime_ustasi_stats",
};

const OXFORD_LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const OXFORD_DATA = {
    A1: [
        { english: "apple", turkish: "elma" },
        { english: "book", turkish: "kitap" },
        { english: "house", turkish: "ev" },
        { english: "teacher", turkish: "öğretmen" },
        { english: "water", turkish: "su" },
    ],
    A2: [
        { english: "holiday", turkish: "tatil" },
        { english: "important", turkish: "önemli" },
        { english: "sometimes", turkish: "bazen" },
    ],
    B1: [
        { english: "environment", turkish: "çevre" },
        { english: "opinion", turkish: "fikir" },
    ],
    B2: [
        { english: "consequence", turkish: "sonuç" },
        { english: "efficient", turkish: "verimli" },
    ],
    C1: [
        { english: "sustainable", turkish: "sürdürülebilir" },
        { english: "notion", turkish: "kavram" },
    ],
};

let words = [];
let dailyData = {
    targetMinutes: 20,
    todayMinutes: 0,
    lastDate: null,
    dailyWordId: null,
    dailyNewWords: 0,
};

let stats = {
    totalCorrect: 0,
    last7DaysQuiz: [], // { date: 'YYYY-MM-DD', count }
    streakCurrent: 0,
    streakBest: 0,
};

let currentQuiz = {
    active: false,
    mode: "mixed",
    currentWord: null,
    direction: null,
    source: "personal",
    oxfordLevel: null,
};

// Yardımcılar
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function speakText(text) {
    if (!window.speechSynthesis || !text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
}

let feedbackAudioCtx = null;

function playFeedbackSound(isCorrect) {
    try {
        if (!window.AudioContext && !window.webkitAudioContext) return;
        if (!feedbackAudioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            feedbackAudioCtx = new Ctx();
        }
        const ctx = feedbackAudioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        const now = ctx.currentTime;

        if (isCorrect) {
            // kısa, neşeli bir ding
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.linearRampToValueAtTime(1320, now + 0.12);
        } else {
            // hafif alçalan uyarı sesi
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.linearRampToValueAtTime(330, now + 0.18);
        }

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
    } catch {}
}

function saveAll() {
    localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(words));
    localStorage.setItem(STORAGE_KEYS.DAILY, JSON.stringify(dailyData));
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
}

function loadAll() {
    try {
        const w = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORDS));
        if (Array.isArray(w)) words = w;
    } catch {}

    try {
        const d = JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY));
        if (d && typeof d === "object") dailyData = { ...dailyData, ...d };
    } catch {}

    try {
        const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.STATS));
        if (s && typeof s === "object") stats = { ...stats, ...s };
    } catch {}

    // Tarih değiştiyse bugünkü süreyi sıfırla ve günlük kelimeyi yenile
    const t = todayStr();
    if (dailyData.lastDate !== t) {
        dailyData.lastDate = t;
        dailyData.todayMinutes = 0;
        dailyData.dailyNewWords = 0;
        dailyData._autoMinutesForToday = 0;
        dailyData.dailyWordId = null;
    }
}

// DOM referansları
const wordForm = document.getElementById("wordForm");
const englishInput = document.getElementById("english");
const turkishInput = document.getElementById("turkish");
const exampleInput = document.getElementById("example");
const wordTagsInput = document.getElementById("wordTags");
const wordListEl = document.getElementById("wordList");
const wordCountBadge = document.getElementById("wordCountBadge");

const searchInput = document.getElementById("searchInput");
const searchLangSelect = document.getElementById("searchLang");
const filterStrengthSelect = document.getElementById("filterStrength");
const tagFilterSelect = document.getElementById("tagFilter");

const dailyWordArea = document.getElementById("dailyWordArea");
const newDailyWordBtn = document.getElementById("newDailyWordBtn");
const dailySpeakBtn = document.getElementById("dailySpeakBtn");

const personalNotesTextarea = document.getElementById("personalNotesTextarea");
const personalNotesSaveBtn = document.getElementById("personalNotesSaveBtn");
const personalNotesStatus = document.getElementById("personalNotesStatus");

const quizModeSelect = document.getElementById("quizMode");
const startQuizBtn = document.getElementById("startQuizBtn");
const quizArea = document.getElementById("quizArea");
const quizTagFilterSelect = document.getElementById("quizTagFilter");
const quizDictationMode = document.getElementById("quizDictationMode");
const startOxfordQuizBtn = document.getElementById("startOxfordQuizBtn");
const oxfordSelectedLevelLabel = document.getElementById("oxfordSelectedLevelLabel");
let currentOxfordLevel = null;

const dailyMinutesInput = document.getElementById("dailyMinutes");
const saveDailyTargetBtn = document.getElementById("saveDailyTargetBtn");
const dailyProgressBar = document.getElementById("dailyProgressBar");
const dailyProgressText = document.getElementById("dailyProgressText");

const statTotalWords = document.getElementById("statTotalWords");
const statTotalCorrect = document.getElementById("statTotalCorrect");
const statLast7Days = document.getElementById("statLast7Days");

const weakWordsListEl = document.getElementById("weakWordsList");
const streakCurrentEl = document.getElementById("streakCurrent");
const streakBestEl = document.getElementById("streakBest");
const badgeAreaEl = document.getElementById("badgeArea");
const questQuestionsProgressEl = document.getElementById("questQuestionsProgress");
const questNewWordsProgressEl = document.getElementById("questNewWordsProgress");
const last7ChartEl = document.getElementById("last7Chart");

let editingWordId = null;

// Kelime ekleme
wordForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const en = englishInput.value.trim();
    const tr = turkishInput.value.trim();
    const ex = exampleInput.value.trim();
    const tagsRaw = (wordTagsInput.value || "").trim();

    if (!en || !tr) return;

    const tags = tagsRaw
        ? tagsRaw
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length)
        : [];

    // Düzenleme modu mu, yeni ekleme mi?
    if (editingWordId) {
        const existing = words.find((w) => w.id === editingWordId);
        if (existing) {
            existing.english = en;
            existing.turkish = tr;
            existing.example = ex || "";
            existing.tags = tags;
        }
        editingWordId = null;
    } else {
        const now = Date.now();
        const word = {
            id: "w_" + now + "_" + Math.random().toString(36).slice(2, 8),
            english: en,
            turkish: tr,
            example: ex || "",
            tags,
            correctCount: 0,
            wrongCount: 0,
            lastSeen: 0,
            createdAt: now,
            nextReviewAt: now,
            level: "new",
        };

        words.push(word);
        // Günlük yeni kelime sayacı
        dailyData.dailyNewWords = (dailyData.dailyNewWords || 0) + 1;
    }
    saveAll();
    renderWords();
    renderDailyWordIfNeeded();
    renderStats();

    wordForm.reset();
    englishInput.focus();
});

function loadPersonalNotes() {
    if (!personalNotesTextarea) return;
    try {
        const saved = localStorage.getItem(NOTES_KEY);
        if (typeof saved === "string") {
            personalNotesTextarea.value = saved;
            if (personalNotesStatus) {
                personalNotesStatus.textContent = "Kaydedildi.";
            }
        }
    } catch {}
}

function savePersonalNotes() {
    if (!personalNotesTextarea) return;
    const val = personalNotesTextarea.value || "";
    try {
        localStorage.setItem(NOTES_KEY, val);
        if (personalNotesStatus) {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, "0");
            const mm = String(now.getMinutes()).padStart(2, "0");
            personalNotesStatus.textContent = "Son kaydedilme: " + hh + ":" + mm;
        }
    } catch {}
}

if (personalNotesSaveBtn) {
    personalNotesSaveBtn.addEventListener("click", () => {
        savePersonalNotes();
    });
}

if (personalNotesTextarea) {
    let notesSaveTimeout = null;
    personalNotesTextarea.addEventListener("input", () => {
        if (personalNotesStatus) {
            personalNotesStatus.textContent = "Kaydediliyor...";
        }
        if (notesSaveTimeout) clearTimeout(notesSaveTimeout);
        notesSaveTimeout = setTimeout(() => {
            savePersonalNotes();
        }, 800);
    });
}

// Filtrelenmiş kelimeleri hesapla
function getFilteredWords() {
    let result = [...words];

    // Arama
    const query = (searchInput?.value || "").trim().toLowerCase();
    const lang = searchLangSelect?.value || "all";
    if (query) {
        result = result.filter((w) => {
            const en = (w.english || "").toLowerCase();
            const tr = (w.turkish || "").toLowerCase();
            if (lang === "en") return en.includes(query);
            if (lang === "tr") return tr.includes(query);
            return en.includes(query) || tr.includes(query);
        });
    }

    // Etiket filtresi
    const tagVal = tagFilterSelect?.value || "all";
    if (tagVal !== "all") {
        result = result.filter((w) => Array.isArray(w.tags) && w.tags.includes(tagVal));
    }

    // Güç filtresi
    const strength = filterStrengthSelect?.value || "all";
    if (strength === "weak20") {
        const scored = result
            .map((w) => ({
                word: w,
                score: (w.wrongCount || 0) * 2 - (w.correctCount || 0),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map((x) => x.word);
        result = scored;
    } else if (strength === "newest") {
        result = result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (strength === "strong") {
        result = result.filter((w) => (w.correctCount || 0) >= 5);
    }

    return result;
}

// Etiket select'lerini güncelle
function updateTagSelects() {
    const allTags = new Set();
    words.forEach((w) => {
        if (Array.isArray(w.tags)) {
            w.tags.forEach((t) => allTags.add(t));
        }
    });

    const tagsArr = Array.from(allTags).sort();

    if (tagFilterSelect) {
        const current = tagFilterSelect.value || "all";
        tagFilterSelect.innerHTML = '<option value="all">Tüm etiketler</option>';
        tagsArr.forEach((t) => {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            tagFilterSelect.appendChild(opt);
        });
        if (current && Array.from(tagFilterSelect.options).some((o) => o.value === current)) {
            tagFilterSelect.value = current;
        }
    }

    if (quizTagFilterSelect) {
        const currentQ = quizTagFilterSelect.value || "all";
        quizTagFilterSelect.innerHTML = '<option value="all">Tüm etiketler</option>';
        tagsArr.forEach((t) => {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            quizTagFilterSelect.appendChild(opt);
        });
        if (currentQ && Array.from(quizTagFilterSelect.options).some((o) => o.value === currentQ)) {
            quizTagFilterSelect.value = currentQ;
        }
    }
}

// Kelime listesi
function renderWords() {
    wordCountBadge.textContent = `${words.length} kelime`;

    if (!words.length) {
        wordListEl.innerHTML = '<p class="text-muted mb-0 small">Henüz kelime eklemedin. Üstteki formdan başlayabilirsin.</p>';
        return;
    }

    const sorted = getFilteredWords();
    wordListEl.innerHTML = "";

    sorted.forEach((w) => {
        const div = document.createElement("div");
        div.className = "word-item";
        div.dataset.id = w.id;
        const correctIcon = w.correctCount >= 5 ? "✅" : "";
        const levelInfo = getWordLevelInfo(w);
        const tagsText = Array.isArray(w.tags) && w.tags.length ? w.tags.join(", ") : "";
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="word-item-title">
                        <span class="word-level-pill ${levelInfo.className}">${levelInfo.label}</span>
                        ${w.english} ${correctIcon}
                    </div>
                    <div class="word-item-sub text-muted">${w.turkish}</div>
                    ${w.example ? `<div class="word-item-sub text-secondary fst-italic">${w.example}</div>` : ""}
                    ${tagsText ? `<div class="word-item-sub text-info">#${tagsText.replace(/,\s*/g, ' #')}</div>` : ""}
                </div>
                <div class="text-end word-item-sub text-muted ms-2">
                    <button class="btn btn-icon-circle btn-outline-light border-0 mb-1 word-speak-btn" title="Telaffuzu dinle">🔊</button>
                    <div>Doğru: ${w.correctCount}</div>
                    <div>Yanlış: ${w.wrongCount}</div>
                    <div class="mt-1 d-flex gap-1 justify-content-end">
                        <button class="btn btn-outline-light btn-sm py-0 px-2 word-edit-btn">Düzenle</button>
                        <button class="btn btn-outline-danger btn-sm py-0 px-2 word-delete-btn">Sil</button>
                    </div>
                </div>
            </div>
        `;
        wordListEl.appendChild(div);
    });

    updateTagSelects();
}

// Kelime düzenleme / silme tıklamaları
wordListEl.addEventListener("click", (e) => {
    const target = e.target;
    const item = target.closest(".word-item");
    if (!item) return;
    const id = item.dataset.id;
    const w = words.find((x) => x.id === id);
    if (!w) return;

    if (target.classList.contains("word-speak-btn")) {
        if (w.english) speakText(w.english);
    } else if (target.classList.contains("word-edit-btn")) {
        englishInput.value = w.english || "";
        turkishInput.value = w.turkish || "";
        exampleInput.value = w.example || "";
        wordTagsInput.value = Array.isArray(w.tags) ? w.tags.join(", ") : "";
        editingWordId = w.id;
        englishInput.focus();
    } else if (target.classList.contains("word-delete-btn")) {
        const ok = confirm("Bu kelimeyi silmek istediğinden emin misin?");
        if (!ok) return;
        words = words.filter((x) => x.id !== id);
        saveAll();
        renderWords();
        renderDailyWordIfNeeded();
        renderStats();
    }
});

// Arama / filtre kontrolleri dinleyicileri
if (searchInput) {
    searchInput.addEventListener("input", () => {
        renderWords();
    });
}

if (searchLangSelect) {
    searchLangSelect.addEventListener("change", () => {
        renderWords();
    });
}

if (filterStrengthSelect) {
    filterStrengthSelect.addEventListener("change", () => {
        renderWords();
    });
}

if (tagFilterSelect) {
    tagFilterSelect.addEventListener("change", () => {
        renderWords();
    });
}

// Günün kelimesi
function chooseDailyWord() {
    if (!words.length) {
        dailyData.dailyWordId = null;
        return null;
    }

    // Az çalışılmış (düşük correctCount) kelimelere öncelik ver
    const sorted = [...words].sort((a, b) => a.correctCount - b.correctCount || a.lastSeen - b.lastSeen);
    const chosen = sorted[0];
    dailyData.dailyWordId = chosen.id;
    saveAll();
    return chosen;
}

function renderDailyWordIfNeeded(force = false) {
    let w = words.find((x) => x.id === dailyData.dailyWordId);
    if (!w || force) {
        w = chooseDailyWord();
    }

    if (!w) {
        dailyWordArea.innerHTML = '<p class="text-muted mb-0 small">Günün kelimesi için önce birkaç kelime ekle.</p>';
        return;
    }

    dailyWordArea.innerHTML = `
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
            <div>
                <div class="h4 mb-1">${w.english}</div>
                <div class="text-muted mb-1">${w.turkish}</div>
                ${w.example ? `<div class="small text-secondary fst-italic">${w.example}</div>` : ""}
            </div>
            <div class="text-end small text-muted">
                <div>Doğru: ${w.correctCount}</div>
                <div>Yanlış: ${w.wrongCount}</div>
            </div>
        </div>
    `;
}

newDailyWordBtn.addEventListener("click", () => {
    renderDailyWordIfNeeded(true);
});

if (dailySpeakBtn) {
    dailySpeakBtn.addEventListener("click", () => {
        const current = words.find((x) => x.id === dailyData.dailyWordId);
        if (current) speakText(current.english);
    });
}

// Quiz
startQuizBtn.addEventListener("click", () => {
    if (!words.length) {
        quizArea.innerHTML = '<p class="text-danger small mb-0">Önce birkaç kelime eklemelisin.</p>';
        return;
    }
    currentQuiz.active = true;
    currentQuiz.mode = quizModeSelect.value;
    currentQuiz.source = "personal";
    currentQuiz.oxfordLevel = null;
    nextQuizQuestion();
});

function pickQuizDirection() {
    if (currentQuiz.mode === "en-to-tr" || currentQuiz.mode === "tr-to-en") {
        return currentQuiz.mode;
    }
    // mixed
    return Math.random() < 0.5 ? "en-to-tr" : "tr-to-en";
}

function nextQuizQuestion() {
    if (!currentQuiz.active || !words.length) return;
    let pool = [...words];
    const quizTag = quizTagFilterSelect?.value || "all";
    if (quizTag !== "all") {
        pool = pool.filter((w) => Array.isArray(w.tags) && w.tags.includes(quizTag));
    }
    if (!pool.length) {
        quizArea.innerHTML = '<p class="text-danger small mb-0">Seçilen etikete ait kelime bulunamadı. Farklı bir etiket seç veya yeni kelime ekle.</p>';
        currentQuiz.active = false;
        return;
    }

    const now = Date.now();
    // Önce zamanı gelmiş (nextReviewAt <= now) kelimelere öncelik ver
    pool.forEach((w) => {
        if (!w.nextReviewAt) w.nextReviewAt = 0;
    });
    const due = pool.filter((w) => w.nextReviewAt <= now);
    if (due.length) {
        pool = due;
    }
    pool = pool.sort((a, b) => a.correctCount - b.correctCount || a.lastSeen - b.lastSeen || a.nextReviewAt - b.nextReviewAt);
    const word = pool[Math.floor(Math.random() * Math.min(pool.length, 15))];

    currentQuiz.currentWord = word;
    currentQuiz.direction = pickQuizDirection();
    word.lastSeen = Date.now();
    saveAll();
    const dictationOn = !!quizDictationMode?.checked;

    let questionSide;
    let answerPlaceholder;
    let labelText;

    if (dictationOn) {
        // Dinleyip yaz modu: İngilizce telaffuz edilir, ekranda Türkçe ipucu gösterilir
        speakText(word.english);
        questionSide = word.turkish;
        answerPlaceholder = "Duyduğun İngilizce kelimeyi yaz";
        labelText = "Dinleyip yaz (TR ipucu → EN yaz)";
    } else {
        questionSide = currentQuiz.direction === "en-to-tr" ? word.english : word.turkish;
        answerPlaceholder = currentQuiz.direction === "en-to-tr" ? "Türkçe karşılığını yaz" : "İngilizce karşılığını yaz";
        labelText = currentQuiz.direction === "en-to-tr" ? "İngilizce → Türkçe" : "Türkçe → İngilizce";
    }

    quizArea.innerHTML = `
        <div class="mb-1 quiz-question-label">${labelText}</div>
        <div class="quiz-word-main mb-3">${questionSide}</div>
        <div class="mb-3">
            <input type="text" class="form-control" id="quizAnswer" placeholder="${answerPlaceholder}" autofocus />
        </div>
        <div class="d-flex gap-2">
            <button class="btn btn-success" id="submitAnswerBtn">Cevabı Kontrol Et</button>
            <button class="btn btn-outline-secondary" id="skipQuestionBtn">Pas Geç</button>
            <button class="btn btn-outline-danger ms-auto" id="stopQuizBtn">Bitir</button>
        </div>
        <div class="mt-2 quiz-result" id="quizResult"></div>
    `;

    document.getElementById("submitAnswerBtn").addEventListener("click", checkQuizAnswer);
    document.getElementById("skipQuestionBtn").addEventListener("click", () => {
        addQuizActivity(1);
        nextQuizQuestion();
    });
    document.getElementById("stopQuizBtn").addEventListener("click", stopQuiz);
    document.getElementById("quizAnswer").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            checkQuizAnswer();
        }
    });
}

function normalize(str) {
    return str.toLowerCase().trim();
}

function checkQuizAnswer() {
    const answerEl = document.getElementById("quizAnswer");
    const resultEl = document.getElementById("quizResult");
    if (!answerEl || !currentQuiz.currentWord) return;

    const userAnswer = normalize(answerEl.value);
    if (!userAnswer) return;

    const w = currentQuiz.currentWord;
    const correct = currentQuiz.direction === "en-to-tr" ? normalize(w.turkish) : normalize(w.english);

    const isCorrect = userAnswer === correct;

    if (isCorrect) {
        w.correctCount += 1;
        stats.totalCorrect += 1;
        resultEl.innerHTML = `<span class="text-success">Doğru! ✔️</span>`;
        playFeedbackSound(true);
    } else {
        w.wrongCount += 1;
        resultEl.innerHTML = `<span class="text-danger">Yanlış. Doğru cevap: <strong>${correct}</strong></span>`;
        playFeedbackSound(false);
    }

    // Spaced repetition: level ve bir sonraki gösterim zamanını güncelle
    updateWordSpacedRepetition(w, isCorrect);

    saveAll();
    renderWords();
    renderDailyWordIfNeeded();
    renderStats();
    addQuizActivity(1);

    setTimeout(() => {
        nextQuizQuestion();
    }, 900);
}

function stopQuiz() {
    currentQuiz.active = false;
    currentQuiz.currentWord = null;
    quizArea.innerHTML = '<p class="text-muted small mb-0">Quiz sonlandırıldı. Tekrar başlamak için "Başlat"a tıkla.</p>';
}

// Quiz istatistikleri
function addQuizActivity(count) {
    const t = todayStr();
    let entry = stats.last7DaysQuiz.find((x) => x.date === t);
    if (!entry) {
        entry = { date: t, count: 0 };
        stats.last7DaysQuiz.push(entry);
    }
    entry.count += count;

    // Sadece son 7 günü tut
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    stats.last7DaysQuiz = stats.last7DaysQuiz.filter((x) => x.date >= sevenDaysAgo);

    saveAll();
    // Quiz aktivitesini çalışma süresine çevir (ör: 5 soru ≈ 1 dk)
    const minutesToAdd = Math.floor((entry.count || 0) / 5);
    if (minutesToAdd > 0) {
        const alreadyAdded = dailyData._autoMinutesForToday || 0;
        const newTotalAuto = Math.min(minutesToAdd, alreadyAdded + minutesToAdd);
        const diff = newTotalAuto - alreadyAdded;
        if (diff > 0) {
            dailyData._autoMinutesForToday = newTotalAuto;
            dailyData.todayMinutes += diff;
        }
    }

    updateStreakWithToday();
    renderDailyProgress();
    renderStats();
}

// Günlük hedef
saveDailyTargetBtn.addEventListener("click", () => {
    const val = Number(dailyMinutesInput.value) || 0;
    if (val < 5) {
        alert("En az 5 dakika hedef belirleyebilirsin.");
        return;
    }
    dailyData.targetMinutes = val;
    saveAll();
    renderDailyProgress();
});

// Kolaylık: quiz yaptıkça dakikaya çeviren küçük bir varsayım (örnek: her 5 soru ≈ 1 dk)
function autoAddStudyMinutesFromQuiz() {
    // Bu fonksiyon doğrudan çağrılmıyor; istersen ileride bağlayabiliriz.
}

function renderDailyProgress() {
    const target = dailyData.targetMinutes || 0;
    const done = dailyData.todayMinutes || 0;

    dailyMinutesInput.value = target || 20;

    if (!target) {
        dailyProgressBar.style.width = "0%";
        dailyProgressBar.textContent = "0 / 0 dk";
        dailyProgressText.textContent = "Henüz günlük hedef belirlemedin.";
        return;
    }

    const ratio = Math.min(100, Math.round((done / target) * 100));
    dailyProgressBar.style.width = ratio + "%";
    dailyProgressBar.textContent = `${done} / ${target} dk`;

    if (done >= target) {
        dailyProgressText.textContent = "Tebrikler! Bugünkü hedefini tamamladın.";
    } else {
        dailyProgressText.textContent = `${target - done} dakika daha çalışarak hedefini tamamlayabilirsin.`;
    }
}

// Dışarıdan elle çalışma süresi eklemek isteyenler için (örneğin konsoldan veya gelecekte eklenecek bir butondan)
function addStudyMinutes(mins) {
    if (!Number.isFinite(mins) || mins <= 0) return;
    dailyData.todayMinutes += Math.round(mins);
    saveAll();
    renderDailyProgress();
}

// İstatistikler
function renderStats() {
    statTotalWords.textContent = words.length;
    statTotalCorrect.textContent = stats.totalCorrect || 0;

    const totalLast7 = stats.last7DaysQuiz.reduce((sum, x) => sum + (x.count || 0), 0);
    statLast7Days.textContent = totalLast7;

    renderWeakWords();
    renderStreak();
    renderBadges();
    renderQuests();
    renderLast7Chart();
}

// Zayıf kelimeler: yanlış sayısı yüksek, doğru sayısı düşük olan ilk 5 kelime
function renderWeakWords() {
    if (!weakWordsListEl) return;

    if (!words.length) {
        weakWordsListEl.innerHTML = '<p class="text-muted mb-0">Quiz çözdükçe en çok zorlandığın kelimeler burada görünecek.</p>';
        return;
    }

    const scored = words
        .map((w) => ({
            word: w,
            score: w.wrongCount * 2 - w.correctCount,
        }))
        .filter((x) => x.word.wrongCount > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    if (!scored.length) {
        weakWordsListEl.innerHTML = '<p class="text-muted mb-0">Şu an belirgin bir zayıf kelimen yok. Harika gidiyorsun!</p>';
        return;
    }

    weakWordsListEl.innerHTML = "";
    scored.forEach(({ word }) => {
        const div = document.createElement("div");
        let levelClass = "weak-word-low";
        if (word.wrongCount >= 3 && word.wrongCount <= 5) {
            levelClass = "weak-word-medium";
        } else if (word.wrongCount > 5) {
            levelClass = "weak-word-high";
        }
        div.className = "weak-word-item " + levelClass + " mb-2 d-flex justify-content-between align-items-center";
        div.innerHTML = `
            <div>
                <strong>${word.english}</strong>
                <span class="text-muted"> • ${word.turkish}</span>
            </div>
            <div class="text-end text-danger-emphasis small">
                <div>Yanlış: ${word.wrongCount}</div>
                <div class="text-success">Doğru: ${word.correctCount}</div>
            </div>
        `;
        weakWordsListEl.appendChild(div);
    });
}

// Günlük streak hesaplama
function updateStreakWithToday() {
    const t = todayStr();
    const todayEntry = stats.last7DaysQuiz.find((x) => x.date === t);
    if (!todayEntry || !todayEntry.count) {
        return;
    }

    // Streak mantığı: bugün soru çözerse streak artar veya devam eder
    if (!stats._lastStreakDate) {
        stats.streakCurrent = 1;
    } else {
        const last = new Date(stats._lastStreakDate);
        const now = new Date(t);
        const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            stats.streakCurrent += 1;
        } else if (diffDays > 1) {
            stats.streakCurrent = 1;
        }
    }

    stats._lastStreakDate = t;
    stats.streakBest = Math.max(stats.streakBest || 0, stats.streakCurrent || 0);
    saveAll();
}

function renderStreak() {
    if (!streakCurrentEl || !streakBestEl) return;
    streakCurrentEl.textContent = stats.streakCurrent || 0;
    streakBestEl.textContent = stats.streakBest || 0;
}

// Oxford seviye butonları ve PDF açma
(function setupOxfordButtons() {
    const levelButtonsContainer = document.getElementById("oxfordLevelButtons");
    if (levelButtonsContainer) {
        levelButtonsContainer.addEventListener("click", (e) => {
            const btn = e.target.closest(".oxford-level-btn");
            if (!btn) return;
            const level = btn.getAttribute("data-level");
            currentOxfordLevel = level;
            if (oxfordSelectedLevelLabel) {
                oxfordSelectedLevelLabel.textContent = "Seçili seviye: Oxford " + level;
            }
            const allBtns = levelButtonsContainer.querySelectorAll(".oxford-level-btn");
            allBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        });
    }

    if (startOxfordQuizBtn) {
        startOxfordQuizBtn.addEventListener("click", () => {
            if (!currentOxfordLevel) {
                alert("Önce bir Oxford seviyesi seçmelisin (A1, A2, B1, B2, C1).");
                return;
            }
            const fileName = "Oxford_Lists_" + currentOxfordLevel + ".pdf";
            const url = "oxford/" + fileName;
            window.open(url, "_blank");
        });
    }
})();

// Kelime seviye bilgisi (Yeni, Öğreniliyor, Pekişmiş, Usta)
function getWordLevelInfo(w) {
    let label = "Yeni";
    let className = "word-level-new";
    const c = w.correctCount || 0;
    const r = w.wrongCount || 0;

    if (c >= 8 && r <= 2) {
        label = "Usta";
        className = "word-level-master";
    } else if (c >= 5) {
        label = "Pekişmiş";
        className = "word-level-strong";
    } else if (c >= 2 || r >= 1) {
        label = "Öğreniliyor";
        className = "word-level-learning";
    }

    return { label, className };
}

// Spaced repetition: her kelimenin bir sonraki gösterim zamanını hesapla
function updateWordSpacedRepetition(w, isCorrect) {
    const baseNow = Date.now();
    const c = w.correctCount || 0;
    const r = w.wrongCount || 0;

    // Basit aralıklar (öğrenme seviyesine göre):
    // Yeni: 5 dk, Öğreniliyor: 30 dk, Pekişmiş: 6 saat, Usta: 2 gün
    let minutes = 5;
    if (c >= 8 && r <= 2) {
        minutes = 60 * 48; // Usta: 2 gün
        w.level = "master";
    } else if (c >= 5) {
        minutes = 60 * 6; // Pekişmiş: 6 saat
        w.level = "strong";
    } else if (c >= 2 || r >= 1) {
        minutes = 30; // Öğreniliyor: 30 dk
        w.level = "learning";
    } else {
        minutes = 5; // Yeni: 5 dk
        w.level = "new";
    }

    // Yanlış cevap verildiyse bir sonraki gösterimi biraz öne çek
    if (!isCorrect) {
        minutes = Math.max(2, Math.floor(minutes / 2));
    }

    w.nextReviewAt = baseNow + minutes * 60 * 1000;
}

// Rozetler
function renderBadges() {
    if (!badgeAreaEl) return;
    const totalWords = words.length;
    const totalCorrect = stats.totalCorrect || 0;
    const streak = stats.streakCurrent || 0;

    const badges = [
        {
            key: "collector",
            label: "Kelime Koleksiyoneri",
            unlocked: totalWords >= 50,
        },
        {
            key: "streak",
            label: "Streak Ustası",
            unlocked: streak >= 7,
        },
        {
            key: "sniper",
            label: "Sniper",
            unlocked: totalCorrect >= 100,
        },
    ];

    badgeAreaEl.innerHTML = "";
    badges.forEach((b) => {
        const span = document.createElement("span");
        span.className = "badge me-1 mb-1 " + (b.unlocked ? "badge-earned" : "badge-locked");
        span.textContent = b.label;
        badgeAreaEl.appendChild(span);
    });
}

// Günlük görevler
function renderQuests() {
    const todayQuestions = (stats.last7DaysQuiz.find((x) => x.date === todayStr())?.count || 0);
    const todayNewWords = dailyData.dailyNewWords || 0;

    const qTarget = 20;
    const wTarget = 5;

    if (questQuestionsProgressEl) {
        questQuestionsProgressEl.textContent = `${todayQuestions} / ${qTarget}`;
        const li = questQuestionsProgressEl.closest(".quest-item");
        if (li) li.classList.toggle("quest-done", todayQuestions >= qTarget);
    }

    if (questNewWordsProgressEl) {
        questNewWordsProgressEl.textContent = `${todayNewWords} / ${wTarget}`;
        const li = questNewWordsProgressEl.closest(".quest-item");
        if (li) li.classList.toggle("quest-done", todayNewWords >= wTarget);
    }
}

// Son 7 gün doğru cevap bar grafiği
function renderLast7Chart() {
    if (!last7ChartEl) return;
    const today = new Date(todayStr());
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        const entry = stats.last7DaysQuiz.find((x) => x.date === key);
        days.push({ date: key, label: d.getDate(), count: entry ? entry.count || 0 : 0 });
    }

    const maxCount = Math.max(1, ...days.map((d) => d.count));
    last7ChartEl.innerHTML = "";

    days.forEach((d) => {
        const bar = document.createElement("div");
        bar.className = "sr-chart-bar";
        const inner = document.createElement("div");
        inner.className = "sr-chart-bar-inner";
        const h = Math.round((d.count / maxCount) * 100);
        inner.style.height = h + "%";
        const label = document.createElement("div");
        label.className = "sr-chart-bar-label";
        label.textContent = d.label;
        bar.appendChild(inner);
        bar.appendChild(label);
        last7ChartEl.appendChild(bar);
    });
}

// İlk yükleme
(function init() {
    loadAll();
    // Eski kayıtlarda tags olmayabilir, normalize et
    words.forEach((w) => {
        if (!Array.isArray(w.tags)) {
            w.tags = [];
        }
        if (!w.level) w.level = "new";
    });
    renderWords();
    renderDailyWordIfNeeded();
    renderDailyProgress();
    renderStats();
    renderWeakWords();
    renderStreak();
    loadPersonalNotes();
})();
