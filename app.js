// --- הגדרות ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// הגדרת קובץ הפונט והחותמת
const HEBREW_FONT_LOCAL = './NotoSansHebrew-Regular.ttf';
const STAMP_IMAGE_URL = './sing.jpeg'; 

// --- אלמנטים ---
const fileInput = document.getElementById('file-upload');
const pdfContainer = document.getElementById('pdf-container');
const saveBtn = document.getElementById('save-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addSigBtn = document.getElementById('add-sig-btn');
const addStampBtn = document.getElementById('add-stamp-btn');

// הודעות שגיאה
const errorMsg = document.createElement('div');
errorMsg.style.cssText = 'color:white; background:#e74c3c; padding:10px; text-align:center; display:none; position:fixed; top:0; width:100%; z-index:9999; font-weight:bold; direction:rtl;';
document.body.prepend(errorMsg);

const sigModal = document.getElementById('signature-modal');
const sigCanvas = document.getElementById('sig-canvas');
const clearSigBtn = document.getElementById('clear-sig');
const confirmSigBtn = document.getElementById('confirm-sig');
const cancelSigBtn = document.getElementById('cancel-sig');

// --- משתנים גלובליים ---
let pdfDoc = null;
let pageNum = 1;
let scale = 1.5;
let signaturePad = null;
let hebrewFontBytes = null;

// פונקציית עזר להצגת שגיאות
const showError = (msg, isCritical = false) => {
    console.error(msg);
    errorMsg.innerText = msg;
    errorMsg.style.display = 'block';
    errorMsg.style.background = isCritical ? '#e74c3c' : '#f39c12';
    setTimeout(() => errorMsg.style.display = 'none', 5000);
};

// --- טעינת פונט בטוחה ---
const loadFontSafe = async () => {
    if (hebrewFontBytes) return true;
    try {
        console.log(`מנסה לטעון פונט מ: ${HEBREW_FONT_LOCAL}`);
        const res = await fetch(`${HEBREW_FONT_LOCAL}?v=${new Date().getTime()}`);
        if (!res.ok) throw new Error(`קובץ לא נמצא (${res.status})`);
        
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 1000) throw new Error("קובץ פונט ריק או פגום");
        
        hebrewFontBytes = buffer;
        console.log("פונט עברית נטען בהצלחה!");
        return true;
    } catch (e) {
        console.warn("כישלון בטעינת פונט עברית:", e);
        showError("שים לב: הפונט בעברית חסר. ניתן לשמור, אך עברית תוצג כריבועים.", false);
        return false;
    }
};

const initSignaturePad = () => {
    if (signaturePad) return;
    signaturePad = new SignaturePad(sigCanvas, { minWidth: 1, maxWidth: 3 });
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    sigCanvas.width = sigCanvas.offsetWidth * ratio;
    sigCanvas.height = sigCanvas.offsetHeight * ratio;
    sigCanvas.getContext("2d").scale(ratio, ratio);
};

// --- טעינת PDF ---
const renderPDF = async (buffer) => {
    try {
        loadFontSafe(); // טעינת פונט ברקע

        const pdfCopy = buffer.slice(0);

        // תצוגה
        const loadingTask = pdfjsLib.getDocument({ data: buffer, cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/', cMapPacked: true });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height; canvas.width = viewport.width;
        
        pdfContainer.style.width = `${viewport.width}px`; pdfContainer.style.height = `${viewport.height}px`;
        pdfContainer.innerHTML = ''; pdfContainer.appendChild(canvas);
        await page.render({ canvasContext: context, viewport }).promise;

        // עריכה
        pdfDoc = await PDFLib.PDFDocument.load(pdfCopy);
        if (typeof fontkit !== 'undefined') pdfDoc.registerFontkit(fontkit);
        
        [saveBtn, addTextBtn, addSigBtn, addStampBtn].forEach(btn => btn.disabled = false);
        
        pdfContainer.dataset.pdfWidth = viewport.width; 
        pdfContainer.dataset.pdfHeight = viewport.height;

    } catch (err) { showError("שגיאה קריטית בטעינת הקובץ: " + err.message, true); }
};

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (ev) => renderPDF(new Uint8Array(ev.target.result));
        reader.readAsArrayBuffer(file);
    } else {
        showError("נא לבחור קובץ PDF תקין.", true);
    }
});

// --- גרירה ---
const makeDraggable = (el) => {
    let isDragging = false; let startX, startY, initialLeft, initialTop;
    
    el.addEventListener('dblclick', () => { if (confirm('למחוק?')) el.remove(); });
    
    if (el.querySelector('img')) {
        el.addEventListener('click', () => {
            if (isDragging) return;
            const img = el.querySelector('img');
            const w = img.offsetWidth;
            img.style.width = `${w >= 200 ? 80 : w + 40}px`;
        });
    }

    const startDrag = (e) => {
        if (e.target.tagName === 'INPUT') return;
        isDragging = true;
        startX = e.clientX || e.touches[0].clientX; startY = e.clientY || e.touches[0].clientY;
        initialLeft = el.offsetLeft; initialTop = el.offsetTop;
    };
    const doDrag = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const currentX = e.clientX || e.touches[0].clientX; const currentY = e.clientY || e.touches[0].clientY;
        el.style.left = `${initialLeft + (currentX - startX)}px`;
        el.style.top = `${initialTop + (currentY - startY)}px`;
    };
    const stopDrag = () => { setTimeout(() => isDragging = false, 100); };

    el.addEventListener('mousedown', startDrag); el.addEventListener('touchstart', startDrag, {passive: false});
    window.addEventListener('mousemove', doDrag); window.addEventListener('touchmove', doDrag, {passive: false});
    window.addEventListener('mouseup', stopDrag); window.addEventListener('touchend', stopDrag);
};

// --- כפתורים ---
addTextBtn.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'draggable text-wrapper';
    div.style.top = '100px'; div.style.left = '50px';
    const input = document.createElement('input');
    input.className = 'text-input'; input.value = 'טקסט';
    div.appendChild(input); pdfContainer.appendChild(div); makeDraggable(div); input.focus();
});

addStampBtn.addEventListener('click', () => {
    const img = document.createElement('img');
    img.src = STAMP_IMAGE_URL; img.dataset.type = 'jpeg'; img.style.width = '100px';
    img.onerror = () => showError("קובץ החותמת sing.jpeg חסר.", false);
    const div = document.createElement('div'); div.className = 'draggable img-wrapper';
    div.style.top = '150px'; div.style.left = '100px';
    div.appendChild(img); pdfContainer.appendChild(div); makeDraggable(div);
});

addSigBtn.addEventListener('click', () => { sigModal.classList.remove('hidden'); initSignaturePad(); signaturePad.clear(); });
cancelSigBtn.addEventListener('click', () => sigModal.classList.add('hidden'));
clearSigBtn.addEventListener('click', () => signaturePad.clear());
confirmSigBtn.addEventListener('click', () => {
    if (signaturePad.isEmpty()) return;
    const img = document.createElement('img');
    img.src = signaturePad.toDataURL('image/png'); img.dataset.type = 'png'; img.style.width = '150px';
    const div = document.createElement('div'); div.className = 'draggable img-wrapper';
    div.style.top = '200px'; div.style.left = '100px';
    div.appendChild(img); pdfContainer.appendChild(div); makeDraggable(div);
    sigModal.classList.add('hidden');
});

// --- שמירה ושיתוף ---
saveBtn.addEventListener('click', async () => {
    if (!pdfDoc) return;
    saveBtn.innerText = 'שומר...'; saveBtn.disabled = true;
    
    try {
        const page = pdfDoc.getPages()[0];
        const { width, height } = page.getSize();
        const scaleX = width / parseFloat(pdfContainer.dataset.pdfWidth);
        const scaleY = height / parseFloat(pdfContainer.dataset.pdfHeight);

        // הטמעת פונט
        let customFont = null;
        if (hebrewFontBytes) {
            try { customFont = await pdfDoc.embedFont(hebrewFontBytes, { subset: true }); } 
            catch (e) { console.warn("הטמעת פונט נכשלה"); }
        }
        if (!customFont) customFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

        // שמירת טקסט
        const textInputs = document.querySelectorAll('.text-input');
        for (const input of textInputs) {
            const val = input.value;
            if (!val || val.trim() === '') continue;
            const wrapper = input.parentElement;
            const x = wrapper.offsetLeft * scaleX;
            const y = height - (wrapper.offsetTop * scaleY) - (18 * scaleY);
            page.drawText(val, { x, y, size: 18 * scaleY, font: customFont, color: PDFLib.rgb(0,0,0), features: { rtl: true } });
        }

        // שמירת תמונות (כאן היה התיקון הקריטי)
        const images = document.querySelectorAll('.draggable img');
        for (const img of images) {
            const wrapper = img.parentElement;
            const bytes = await fetch(img.src).then(res => res.arrayBuffer());
            
            let pdfImage;
            // תיקון: שימוש ב-embedJpg במקום embedJpeg
            if (img.dataset.type === 'jpeg' || img.src.toLowerCase().endsWith('.jpg') || img.src.toLowerCase().endsWith('.jpeg')) {
                pdfImage = await pdfDoc.embedJpg(bytes); // <-- תוקן כאן
            } else {
                pdfImage = await pdfDoc.embedPng(bytes);
            }
            
            const w = img.offsetWidth * scaleX; const h = img.offsetHeight * scaleY;
            const x = wrapper.offsetLeft * scaleX;
            const y = height - (wrapper.offsetTop * scaleY) - h;
            page.drawImage(pdfImage, { x, y, width: w, height: h });
        }

        const modifiedBytes = await pdfDoc.save();
        const file = new File([modifiedBytes], "signed.pdf", { type: "application/pdf" });
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'מסמך חתום' });
        } else {
            const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = 'signed.pdf'; a.click();
        }

    } catch (e) { 
        showError("שגיאה בשמירה: " + e.message, true); 
    } finally { 
        saveBtn.innerText = 'שמור ושתף'; saveBtn.disabled = false; 
    }
});
