// --- app.js ---

// הגדרות
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const HEBREW_FONT_LOCAL = './NotoSansHebrew-Regular.ttf';
const STAMP_IMAGE_URL = './sing.jpeg'; 

// אלמנטים
const fileInput = document.getElementById('file-upload');
// שים לב: אנחנו מוסיפים את העמודים לתוך workspace, לא משתמשים ב-pdfContainer הישן כקופסה יחידה
const workspace = document.getElementById('workspace'); 
const saveBtn = document.getElementById('save-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addSigBtn = document.getElementById('add-sig-btn');
const addStampBtn = document.getElementById('add-stamp-btn');

// הודעות שגיאה
const errorMsg = document.createElement('div');
errorMsg.style.cssText = 'color:white; background:#e74c3c; padding:10px; text-align:center; display:none; position:fixed; top:0; width:100%; z-index:9999; font-weight:bold; direction:rtl;';
document.body.prepend(errorMsg);

// מודל חתימה
const sigModal = document.getElementById('signature-modal');
const sigCanvas = document.getElementById('sig-canvas');
const clearSigBtn = document.getElementById('clear-sig');
const confirmSigBtn = document.getElementById('confirm-sig');
const cancelSigBtn = document.getElementById('cancel-sig');

// משתנים
let pdfDoc = null; 
let signaturePad = null;
let hebrewFontBytes = null;
// מערך לשמירת המידע על כל עמוד (רוחב/גובה מקורי, וקנה מידה)
let pagesMeta = []; 

const showError = (msg, isCritical = false) => {
    console.error(msg); errorMsg.innerText = msg; errorMsg.style.display = 'block';
    errorMsg.style.background = isCritical ? '#e74c3c' : '#f39c12';
    setTimeout(() => errorMsg.style.display = 'none', 5000);
};

// טעינת פונט
const loadFontSafe = async () => {
    if (hebrewFontBytes) return true;
    try {
        const res = await fetch(`${HEBREW_FONT_LOCAL}?v=${new Date().getTime()}`);
        if (!res.ok) throw new Error("חסר");
        hebrewFontBytes = await res.arrayBuffer();
        return true;
    } catch (e) {
        showError("שים לב: הפונט בעברית חסר, הטקסט עשוי להופיע כריבועים.", false);
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

// --- המנוע החדש: רינדור כל העמודים והתאמה למסך ---
const renderPDF = async (buffer) => {
    try {
        loadFontSafe();
        
        // ניקוי סביבת העבודה (מחיקת עמודים קודמים)
        // שומרים רק את האלמנט הריק אם יש (אבל עדיף לנקות הכל ולבנות מחדש)
        workspace.innerHTML = ''; 
        pagesMeta = [];

        const loadingTask = pdfjsLib.getDocument({ data: buffer, cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/', cMapPacked: true });
        const pdf = await loadingTask.promise;
        
        // חישוב רוחב המסך הזמין (פחות שוליים של 40 פיקסל)
        const screenWidth = window.innerWidth - 40;

        // לולאה על כל העמודים במסמך
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // חישוב Scale כדי שיתאים לרוחב הנייד (Fit Width)
            const unscaledViewport = page.getViewport({ scale: 1 });
            // אם המסך קטן מהדף, נקטין. אם המסך גדול, נגדיל קצת (עד מקסימום 1.5)
            let scale = screenWidth / unscaledViewport.width;
            if (scale > 1.5) scale = 1.5; // הגבלה שלא יהיה ענק בדסקטופ

            const viewport = page.getViewport({ scale });

            // יצירת מיכל לעמוד (Page Wrapper)
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page';
            pageContainer.id = `page-${pageNum}`; // מזהה ייחודי לכל עמוד
            pageContainer.style.width = `${viewport.width}px`;
            pageContainer.style.height = `${viewport.height}px`;

            // קנבס
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            pageContainer.appendChild(canvas);
            workspace.appendChild(pageContainer);

            // רינדור
            await page.render({ canvasContext: context, viewport }).promise;

            // שמירת נתונים לחישובים בשמירה
            pagesMeta[pageNum] = {
                width: viewport.width,
                height: viewport.height,
                scale: scale
            };
        }

        // טעינה ל-PDFLib לצורך עריכה
        pdfDoc = await PDFLib.PDFDocument.load(buffer.slice(0));
        if (typeof fontkit !== 'undefined') pdfDoc.registerFontkit(fontkit);
        
        // שחרור כפתורים
        [saveBtn, addTextBtn, addSigBtn, addStampBtn].forEach(btn => btn.disabled = false);

    } catch (err) { showError("שגיאה בטעינה: " + err.message, true); }
};

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (ev) => renderPDF(new Uint8Array(ev.target.result));
        reader.readAsArrayBuffer(file);
    }
});

// --- לוגיקת גרירה משופרת (תומכת בכל העמודים) ---
const makeDraggable = (el) => {
    let isDragging = false; 
    let startX, startY, initialLeft, initialTop;
    
    el.addEventListener('dblclick', () => { if (confirm('למחוק?')) el.remove(); });
    
    if (el.querySelector('img')) {
        el.addEventListener('click', (e) => {
            if (isDragging) return;
            const img = el.querySelector('img');
            const w = img.offsetWidth;
            img.style.width = `${w >= 150 ? 60 : w + 30}px`;
        });
    }

    const startDrag = (e) => {
        if (e.target.tagName === 'INPUT') return;
        isDragging = true;
        
        // מציאת העמוד הנוכחי שהאלמנט נמצא עליו (כדי לטפל בקואורדינטות נכון)
        // אבל זה אוטומטי כי ה-position absolute הוא ביחס ל-parent (העמוד)
        
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
        
        const dx = currentX - startX;
        const dy = currentY - startY;

        el.style.left = `${initialLeft + dx}px`;
        el.style.top = `${initialTop + dy}px`;
    };

    const stopDrag = () => { setTimeout(() => isDragging = false, 100); };

    el.addEventListener('mousedown', startDrag); el.addEventListener('touchstart', startDrag, {passive: false});
    window.addEventListener('mousemove', doDrag); window.addEventListener('touchmove', doDrag, {passive: false});
    window.addEventListener('mouseup', stopDrag); window.addEventListener('touchend', stopDrag);
};

// פונקציית עזר: הוספת אלמנט תמיד לעמוד הראשון הנראה או לעמוד 1
// או פשוט לעמוד הראשון, ואז המשתמש יגרור.
// שיפור: הוספת האלמנט למרכז המסך הנוכחי (viewport)
const getVisiblePage = () => {
    // כרגע פשוט נחזיר את עמוד 1 כברירת מחדל, אבל אפשר לשכלל
    // האלמנטים מתווספים לתוך page-1 כברירת מחדל
    const page1 = document.getElementById('page-1');
    return page1 || document.querySelector('.pdf-page');
};

const addElementToPage = (element) => {
    const targetPage = getVisiblePage();
    if (!targetPage) return;
    
    // מיקום ראשוני
    element.style.top = '50px'; 
    element.style.left = '50px';
    
    targetPage.appendChild(element);
    makeDraggable(element);
};

addTextBtn.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'draggable text-wrapper';
    const input = document.createElement('input');
    input.className = 'text-input'; input.value = 'טקסט';
    div.appendChild(input); 
    addElementToPage(div);
    input.focus();
});

addStampBtn.addEventListener('click', () => {
    const img = document.createElement('img');
    img.src = STAMP_IMAGE_URL; img.dataset.type = 'jpeg'; img.style.width = '80px';
    img.onerror = () => showError("קובץ חותמת חסר.", false);
    const div = document.createElement('div'); div.className = 'draggable img-wrapper';
    div.appendChild(img); 
    addElementToPage(div);
});

addSigBtn.addEventListener('click', () => { sigModal.classList.remove('hidden'); initSignaturePad(); signaturePad.clear(); });
cancelSigBtn.addEventListener('click', () => sigModal.classList.add('hidden'));
clearSigBtn.addEventListener('click', () => signaturePad.clear());
confirmSigBtn.addEventListener('click', () => {
    if (signaturePad.isEmpty()) return;
    const img = document.createElement('img');
    img.src = signaturePad.toDataURL('image/png'); img.dataset.type = 'png'; img.style.width = '120px';
    const div = document.createElement('div'); div.className = 'draggable img-wrapper';
    div.appendChild(img); 
    addElementToPage(div);
    sigModal.classList.add('hidden');
});

// --- שמירה חכמה (לכל העמודים) ---
saveBtn.addEventListener('click', async () => {
    if (!pdfDoc) return;
    saveBtn.innerText = 'מעבד...'; saveBtn.disabled = true;
    
    try {
        let customFont = null;
        if (hebrewFontBytes) {
            try { customFont = await pdfDoc.embedFont(hebrewFontBytes, { subset: true }); } catch (e) {}
        }
        if (!customFont) customFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

        // לולאה על כל העמודים ב-PDF
        const pages = pdfDoc.getPages();
        
        for (let i = 0; i < pages.length; i++) {
            const pageNum = i + 1; // מספרי עמודים מתחילים ב-1 ב-UI
            const pdfPage = pages[i];
            
            // מציאת ה-DIV ב-HTML שמייצג את העמוד הזה
            const pageContainer = document.getElementById(`page-${pageNum}`);
            if (!pageContainer) continue;

            const { width: pdfWidth, height: pdfHeight } = pdfPage.getSize();
            const meta = pagesMeta[pageNum]; // המידע ששמרנו ברינדור (scale וכו')
            
            // יחסי המרה בין המסך ל-PDF
            const scaleX = pdfWidth / meta.width;
            const scaleY = pdfHeight / meta.height;

            // חיפוש אלמנטים שנמצאים *רק* בתוך העמוד הזה
            const textInputs = pageContainer.querySelectorAll('.text-input');
            for (const input of textInputs) {
                const val = input.value;
                if (!val) continue;
                const wrapper = input.parentElement;
                
                // חישוב מיקום יחסי ל-Container של העמוד
                const x = wrapper.offsetLeft * scaleX;
                const y = pdfHeight - (wrapper.offsetTop * scaleY) - (18 * scaleY); // תיקון גובה גופן
                
                pdfPage.drawText(val, { 
                    x, y, 
                    size: 16 * scaleY, 
                    font: customFont, 
                    color: PDFLib.rgb(0,0,0),
                    features: { rtl: true } 
                });
            }

            const images = pageContainer.querySelectorAll('.draggable img');
            for (const img of images) {
                const wrapper = img.parentElement;
                const bytes = await fetch(img.src).then(res => res.arrayBuffer());
                
                let pdfImage;
                if (img.dataset.type === 'jpeg' || img.src.toLowerCase().endsWith('.jpg')) {
                    pdfImage = await pdfDoc.embedJpg(bytes);
                } else {
                    pdfImage = await pdfDoc.embedPng(bytes);
                }
                
                const w = img.offsetWidth * scaleX; 
                const h = img.offsetHeight * scaleY;
                const x = wrapper.offsetLeft * scaleX;
                const y = pdfHeight - (wrapper.offsetTop * scaleY) - h;
                
                pdfPage.drawImage(pdfImage, { x, y, width: w, height: h });
            }
        }

        const modifiedBytes = await pdfDoc.save();
        const file = new File([modifiedBytes], "signed.pdf", { type: "application/pdf" });
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
            // כאן נפתח תפריט השיתוף - המשתמש יבחר ב-Outlook
            await navigator.share({ files: [file], title: 'מסמך חתום' });
        } else {
            const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = 'signed.pdf'; a.click();
        }

    } catch (e) { 
        showError("שגיאה: " + e.message, true); 
    } finally { 
        saveBtn.innerText = 'שמור ושתף'; saveBtn.disabled = false; 
    }
});
