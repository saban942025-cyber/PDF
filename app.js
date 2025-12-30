// --- הגדרות ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const HEBREW_FONT_LOCAL = './NotoSansHebrew-Regular.ttf';
const STAMP_IMAGE_URL = './sing.jpeg';

// DOM Elements
const fileInput = document.getElementById('file-upload');
const pdfContainer = document.getElementById('pdf-container');
const saveBtn = document.getElementById('save-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addSigBtn = document.getElementById('add-sig-btn');
const addStampBtn = document.getElementById('add-stamp-btn');

// Modal Elements
const sigModal = document.getElementById('signature-modal');
const sigCanvas = document.getElementById('sig-canvas');
const clearSigBtn = document.getElementById('clear-sig');
const confirmSigBtn = document.getElementById('confirm-sig');
const cancelSigBtn = document.getElementById('cancel-sig');

// State
let pdfDoc = null;
let signaturePad = null;
let hebrewFontBytes = null;
let pageMeta = []; // שומר מידע על כל העמודים

// --- Initialization ---
const initSignaturePad = () => {
    signaturePad = new SignaturePad(sigCanvas, { minWidth: 1, maxWidth: 3 });
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    sigCanvas.width = sigCanvas.offsetWidth * ratio;
    sigCanvas.height = sigCanvas.offsetHeight * ratio;
    sigCanvas.getContext("2d").scale(ratio, ratio);
};

const loadFont = async () => {
    if (hebrewFontBytes) return;
    try {
        const res = await fetch(`${HEBREW_FONT_LOCAL}?v=${Date.now()}`);
        if(res.ok) hebrewFontBytes = await res.arrayBuffer();
    } catch(e) { console.warn("No font found"); }
};

// --- המנוע החדש: ריבוי עמודים (Multi-Page) ---
const renderPDF = async (uint8Array) => {
    // 1. ניקוי המסך
    pdfContainer.innerHTML = '';
    pageMeta = [];
    loadFont();

    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    // חישוב רוחב מסך להתאמה לנייד
    const screenWidth = window.innerWidth - 30;

    // 2. לולאה שעוברת על *כל* העמודים
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);

        // חישוב הקטנה (Scale) שתתאים לרוחב הטלפון
        const unscaledViewport = page.getViewport({ scale: 1 });
        let scale = screenWidth / unscaledViewport.width;
        if (scale > 1.3) scale = 1.3; // הגבלה למחשב

        const viewport = page.getViewport({ scale });

        // יצירת קנבס לכל עמוד בנפרד
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.className = 'pdf-page-canvas';

        // עטיפה ב-DIV לכל עמוד
        const wrapper = document.createElement('div');
        wrapper.className = 'page-wrapper';
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;
        wrapper.appendChild(canvas);

        pdfContainer.appendChild(wrapper);

        // רינדור העמוד
        await page.render({ canvasContext: context, viewport }).promise;

        // שמירת נתונים לחישוב המיקום בשמירה
        pageMeta.push({
            w: viewport.width,
            h: viewport.height,
            scale: scale,
            originalW: unscaledViewport.width,
            originalH: unscaledViewport.height
        });
    }

    // 3. טעינה לעריכה
    pdfDoc = await PDFLib.PDFDocument.load(uint8Array);
    if (typeof fontkit !== 'undefined') pdfDoc.registerFontkit(fontkit);

    // שחרור כפתורים
    [saveBtn, addTextBtn, addSigBtn, addStampBtn].forEach(b => b.disabled = false);
};

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => renderPDF(new Uint8Array(ev.target.result));
        reader.readAsArrayBuffer(file);
    }
});

// --- גרירה והוספת אלמנטים ---
const makeDraggable = (el) => {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    el.addEventListener('dblclick', () => { if(confirm('למחוק?')) el.remove(); });

    if (el.querySelector('img')) {
        el.addEventListener('click', () => {
             if (isDragging) return;
             const img = el.querySelector('img');
             const w = img.offsetWidth;
             img.style.width = `${w >= 150 ? 50 : w + 50}px`;
        });
    }

    const startDrag = (e) => {
        isDragging = true;
        startX = e.clientX || e.touches[0].clientX;
        startY = e.clientY || e.touches[0].clientY;
        initialLeft = el.offsetLeft;
        initialTop = el.offsetTop;
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const currentX = e.clientX || e.touches[0].clientX;
        const currentY = e.clientY || e.touches[0].clientY;
        el.style.left = `${initialLeft + (currentX - startX)}px`;
        el.style.top = `${initialTop + (currentY - startY)}px`;
    };

    const stopDrag = () => { isDragging = false; };

    el.addEventListener('mousedown', startDrag); el.addEventListener('touchstart', startDrag, {passive: false});
    window.addEventListener('mousemove', doDrag); window.addEventListener('touchmove', doDrag, {passive: false});
    window.addEventListener('mouseup', stopDrag); window.addEventListener('touchend', stopDrag);
};

const addElement = (content) => {
    const div = document.createElement('div');
    div.className = 'draggable';
    // ממקם במרכז המסך הנוכחי בערך (לפי הגלילה)
    div.style.top = `${window.scrollY + 100}px`;
    div.style.left = '50px';
    div.appendChild(content);
    pdfContainer.appendChild(div);
    makeDraggable(div);
};

addTextBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'text-input';
    input.value = 'טקסט';
    addElement(input);
});

addStampBtn.addEventListener('click', () => {
    const img = document.createElement('img');
    img.src = STAMP_IMAGE_URL; img.dataset.type = 'jpeg'; img.style.width = '80px';
    addElement(img);
});

addSigBtn.addEventListener('click', () => {
    sigModal.classList.remove('hidden');
    if (!signaturePad) initSignaturePad();
    signaturePad.clear();
});

cancelSigBtn.addEventListener('click', () => sigModal.classList.add('hidden'));
clearSigBtn.addEventListener('click', () => signaturePad.clear());

confirmSigBtn.addEventListener('click', () => {
    if (signaturePad.isEmpty()) return;
    const img = document.createElement('img');
    img.src = signaturePad.toDataURL('image/png'); img.dataset.type = 'png'; img.style.width = '120px';
    addElement(img);
    sigModal.classList.add('hidden');
});

// --- שמירה חכמה (תמיכה בריבוי דפים) ---
const savePDF = async () => {
    if (!pdfDoc) return;
    saveBtn.innerText = 'שומר...';

    try {
        let customFont;
        if (hebrewFontBytes) try { customFont = await pdfDoc.embedFont(hebrewFontBytes, {subset:true}); } catch(e){}
        if (!customFont) customFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

        const pages = pdfDoc.getPages();
        const elements = pdfContainer.querySelectorAll('.draggable');

        for (const el of elements) {
            // חישוב: באיזה עמוד האלמנט נמצא?
            let currentY = el.offsetTop;
            let targetPageIndex = -1;
            let accumulatedHeight = 0;
            let yOnPage = 0;

            // בדיקה מול גובה העמודים שהצגנו
            for (let i = 0; i < pageMeta.length; i++) {
                const meta = pageMeta[i];
                // מוסיפים 10 פיקסל מרווח לחישוב
                if (currentY >= accumulatedHeight && currentY < accumulatedHeight + meta.h + 10) {
                    targetPageIndex = i;
                    yOnPage = currentY - accumulatedHeight;
                    break;
                }
                accumulatedHeight += meta.h + 10; // +10 למרווח בין דפים
            }

            if (targetPageIndex === -1) continue;

            const page = pages[targetPageIndex];
            const meta = pageMeta[targetPageIndex];

            // המרה לקואורדינטות PDF
            const scaleFactor = meta.originalH / meta.h;
            const pdfX = el.offsetLeft * scaleFactor;
            const elHeight = el.offsetHeight;
            const pdfY = meta.originalH - (yOnPage * scaleFactor) - (elHeight * scaleFactor);

            if (el.querySelector('input')) {
                const text = el.querySelector('input').value;
                page.drawText(text, { x: pdfX, y: pdfY + (5 * scaleFactor), size: 16, font: customFont, color: PDFLib.rgb(0,0,0), features: {rtl:true} });
            } else if (el.querySelector('img')) {
                const imgEl = el.querySelector('img');
                const imgBytes = await fetch(imgEl.src).then(r => r.arrayBuffer());
                let pdfImage;
                if (imgEl.dataset.type === 'jpeg') pdfImage = await pdfDoc.embedJpg(imgBytes);
                else pdfImage = await pdfDoc.embedPng(imgBytes);

                page.drawImage(pdfImage, {
                    x: pdfX,
                    y: pdfY,
                    width: imgEl.offsetWidth * scaleFactor,
                    height: imgEl.offsetHeight * scaleFactor
                });
            }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const file = new File([blob], "signed_doc.pdf", { type: "application/pdf" });

        if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'מסמך חתום' });
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'signed.pdf'; a.click();
        }

    } catch (err) {
        alert("שגיאה בשמירה: " + err.message);
    } finally {
        saveBtn.innerText = 'שמור ושתף';
    }
};

saveBtn.addEventListener('click', savePDF);
