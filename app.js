const HEBREW_FONT_LOCAL = './NotoSansHebrew-Regular.ttf';
const STAMP_IMAGE_URL = './sing.jpeg';

// אלמנטים
const fileInput = document.getElementById('file-upload');
const pdfContainer = document.getElementById('pdf-container');
const saveBtn = document.getElementById('save-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addSigBtn = document.getElementById('add-sig-btn');
const addStampBtn = document.getElementById('add-stamp-btn');
const sigModal = document.getElementById('signature-modal');
const sigCanvas = document.getElementById('sig-canvas');
const clearSigBtn = document.getElementById('clear-sig');
const confirmSigBtn = document.getElementById('confirm-sig');
const cancelSigBtn = document.getElementById('cancel-sig');

// משתנים
let pdfDoc = null;
let signaturePad = null;
let hebrewFontBytes = null;
let pageMeta = []; // שומר נתונים על כל עמוד בנפרד

// --- פונקציות עזר ---
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
    } catch(e) { console.warn("Font not found"); }
};

// בדיקה האם הקובץ הוא PDF תקין
const isValidPDF = (data) => {
    if (!data || data.length < 4) return false;
    // בדיקת חתימת %PDF
    return data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
};

// --- המנוע החדש: הצגת כל העמודים ---
const renderPDF = async (uint8Array) => {
    if (!isValidPDF(uint8Array)) {
        alert("שגיאה: הקובץ אינו PDF תקין או שהוא פגום.");
        return;
    }

    pdfContainer.innerHTML = ''; // ניקוי
    pageMeta = [];
    loadFont();

    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    // חישוב רוחב מסך להתאמה
    const screenWidth = window.innerWidth - 20;

    // לולאה על כל הדפים
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        
        // חישוב Scale
        const unscaledViewport = page.getViewport({ scale: 1 });
        let scale = screenWidth / unscaledViewport.width;
        if (scale > 1.2) scale = 1.2; // לא להגדיל יותר מדי

        const viewport = page.getViewport({ scale });

        // יצירת קנבס
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // יצירת עוטף (Wrapper) לכל עמוד
        const wrapper = document.createElement('div');
        wrapper.className = 'page-wrapper';
        wrapper.id = `page-${pageNum}`;
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;
        wrapper.appendChild(canvas);
        
        pdfContainer.appendChild(wrapper);

        await page.render({ canvasContext: context, viewport }).promise;

        // שמירת נתונים לחישובים בהמשך
        pageMeta.push({
            w: viewport.width,
            h: viewport.height,
            scale: scale,
            originalW: unscaledViewport.width,
            originalH: unscaledViewport.height
        });
    }

    // טעינה לעריכה
    pdfDoc = await PDFLib.PDFDocument.load(uint8Array);
    if (typeof fontkit !== 'undefined') pdfDoc.registerFontkit(fontkit);
    
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

// --- גרירה חכמה ---
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
        if (e.target.tagName === 'INPUT') return;
        isDragging = true;
        startX = e.clientX || e.touches[0].clientX;
        startY = e.clientY || e.touches[0].clientY;
        initialLeft = el.offsetLeft;
        initialTop = el.offsetTop;
        el.style.opacity = '0.7';
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        e.preventDefault(); // מונע גלילה רק כשגוררים
        const currentX = e.clientX || e.touches[0].clientX;
        const currentY = e.clientY || e.touches[0].clientY;
        el.style.left = `${initialLeft + (currentX - startX)}px`;
        el.style.top = `${initialTop + (currentY - startY)}px`;
    };

    const stopDrag = () => { isDragging = false; el.style.opacity = '1'; };

    el.addEventListener('touchstart', startDrag, {passive: false});
    window.addEventListener('touchmove', doDrag, {passive: false});
    window.addEventListener('touchend', stopDrag);
    el.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
};

const addElement = (content) => {
    const div = document.createElement('div');
    div.className = 'draggable';
    // ממקם במרכז איזור הגלילה
    const scrollTop = document.getElementById('workspace').scrollTop;
    div.style.top = `${scrollTop + 150}px`;
    div.style.left = '50px';
    div.appendChild(content);
    pdfContainer.appendChild(div);
    makeDraggable(div);
};

addTextBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'text-input'; input.value = 'טקסט';
    addElement(input);
});

addStampBtn.addEventListener('click', () => {
    const img = document.createElement('img');
    img.src = STAMP_IMAGE_URL; img.dataset.type = 'jpeg'; img.style.width = '80px';
    img.onerror = () => alert("חסרה תמונת חותמת");
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

// --- שמירה ---
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
            // חישוב באיזה עמוד האלמנט נמצא
            let elY = el.offsetTop;
            let targetPageIdx = -1;
            let accumulatedH = 0;
            let yOnPage = 0;
            
            for(let i=0; i < pageMeta.length; i++) {
                const meta = pageMeta[i];
                if (elY >= accumulatedH && elY < accumulatedH + meta.h + 20) {
                    targetPageIdx = i;
                    yOnPage = elY - accumulatedH;
                    break;
                }
                accumulatedH += meta.h + 20;
            }
            
            if (targetPageIdx === -1) continue;

            const page = pages[targetPageIdx];
            const meta = pageMeta[targetPageIdx];
            const sf = meta.originalH / meta.h;
            
            const pdfX = el.offsetLeft * sf;
            const elH = el.offsetHeight;
            const pdfY = meta.originalH - (yOnPage * sf) - (elH * sf);

            if (el.querySelector('input')) {
                const txt = el.querySelector('input').value;
                page.drawText(txt, { x: pdfX, y: pdfY + (5*sf), size: 16, font: customFont, color: PDFLib.rgb(0,0,0), features:{rtl:true} });
            } else if (el.querySelector('img')) {
                const imgEl = el.querySelector('img');
                const bytes = await fetch(imgEl.src).then(r => r.arrayBuffer());
                let pdfImg;
                if (imgEl.dataset.type === 'jpeg') pdfImg = await pdfDoc.embedJpg(bytes);
                else pdfImg = await pdfDoc.embedPng(bytes);
                
                page.drawImage(pdfImg, {
                    x: pdfX, y: pdfY,
                    width: imgEl.offsetWidth * sf,
                    height: imgEl.offsetHeight * sf
                });
            }
        }

        const bytes = await pdfDoc.save();
        const file = new File([bytes], "signed.pdf", { type: "application/pdf" });

        if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'מסמך חתום' });
        } else {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
            link.download = 'signed.pdf';
            link.click();
        }

    } catch (e) {
        alert("שגיאה: " + e.message);
    } finally {
        saveBtn.innerText = 'שמור ושתף';
    }
};

saveBtn.addEventListener('click', savePDF);
