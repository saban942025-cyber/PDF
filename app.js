// --- Configuration ---
// הגדרת ה-Worker של PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- DOM Elements ---
const fileInput = document.getElementById('file-upload');
const pdfContainer = document.getElementById('pdf-container');
const saveBtn = document.getElementById('save-btn');
const shareBtn = document.getElementById('share-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addSigBtn = document.getElementById('add-sig-btn');

// יצירת אלמנט להצגת שגיאות
const errorMsg = document.createElement('div');
errorMsg.style.color = 'red';
errorMsg.style.padding = '10px';
errorMsg.style.textAlign = 'center';
errorMsg.style.display = 'none';
pdfContainer.parentElement.insertBefore(errorMsg, pdfContainer);

// Modal Elements
const sigModal = document.getElementById('signature-modal');
const sigCanvas = document.getElementById('sig-canvas');
const clearSigBtn = document.getElementById('clear-sig');
const confirmSigBtn = document.getElementById('confirm-sig');
const cancelSigBtn = document.getElementById('cancel-sig');

// --- State ---
let pdfDoc = null;
let pageNum = 1;
let scale = 1.5;
let signaturePad = null;

// --- Helpers ---
const validatePDFHeader = (uint8Array) => {
    if (uint8Array.length < 4) return false;
    return uint8Array[0] === 0x25 && 
           uint8Array[1] === 0x50 && 
           uint8Array[2] === 0x44 && 
           uint8Array[3] === 0x46;
};

const showError = (msg) => {
    console.error(msg);
    errorMsg.textContent = `שגיאה: ${msg}`;
    errorMsg.style.display = 'block';
    pdfContainer.style.opacity = '0.5';
};

const clearError = () => {
    errorMsg.style.display = 'none';
    pdfContainer.style.opacity = '1';
};

// --- Initialization ---
const initSignaturePad = () => {
    if (signaturePad) return;
    signaturePad = new SignaturePad(sigCanvas, { minWidth: 1, maxWidth: 3 });
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    sigCanvas.width = sigCanvas.offsetWidth * ratio;
    sigCanvas.height = sigCanvas.offsetHeight * ratio;
    sigCanvas.getContext("2d").scale(ratio, ratio);
};

// --- PDF Rendering ---
const renderPDF = async (originalBuffer) => {
    clearError();
    try {
        if (!validatePDFHeader(originalBuffer)) {
            throw new Error("קובץ לא תקין או פגום.");
        }

        // שכפול הזיכרון (חשוב מאוד ליציבות)
        const pdfCopy = originalBuffer.slice(0); 

        // טעינה ויזואלית (PDF.js)
        const loadingTask = pdfjsLib.getDocument({ 
            data: originalBuffer, 
            cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true
        });
        
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        
        // הכנת הקנבס
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        pdfContainer.style.width = `${viewport.width}px`;
        pdfContainer.style.height = `${viewport.height}px`;
        pdfContainer.innerHTML = ''; 
        pdfContainer.appendChild(canvas);

        await page.render({ canvasContext: context, viewport }).promise;

        // טעינה לעריכה (PDF-Lib)
        pdfDoc = await PDFLib.PDFDocument.load(pdfCopy);
        
        // שחרור כפתורים - כאן הם הופכים ללחיצים
        saveBtn.disabled = false;
        addTextBtn.disabled = false;
        addSigBtn.disabled = false;
        
        // שמירת מידות
        pdfContainer.dataset.pdfWidth = viewport.width;
        pdfContainer.dataset.pdfHeight = viewport.height;

        console.log("PDF Loaded Successfully");

    } catch (err) {
        showError(err.message);
    }
};

// --- File Handling ---
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        showError("נא לבחור קובץ PDF בלבד.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
        if (ev.target.result) {
            const buffer = new Uint8Array(ev.target.result);
            renderPDF(buffer);
        }
    };
    reader.readAsArrayBuffer(file);
});

// --- UI Logic ---
const makeDraggable = (el) => {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

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
        const dx = currentX - startX;
        const dy = currentY - startY;
        el.style.left = `${initialLeft + dx}px`;
        el.style.top = `${initialTop + dy}px`;
    };

    const stopDrag = () => { isDragging = false; };

    el.addEventListener('mousedown', startDrag);
    el.addEventListener('touchstart', startDrag, {passive: false});
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('touchmove', doDrag, {passive: false});
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
};

// הוספת אלמנטים
addTextBtn.addEventListener('click', () => {
    const div = document.createElement('div');
    div.className = 'draggable';
    div.style.top = '50px';
    div.style.left = '50px';
    const input = document.createElement('input');
    input.className = 'text-input';
    input.value = 'טקסט';
    div.appendChild(input);
    pdfContainer.appendChild(div);
    makeDraggable(div);
});

addSigBtn.addEventListener('click', () => {
    sigModal.classList.remove('hidden');
    initSignaturePad();
    signaturePad.clear();
});

cancelSigBtn.addEventListener('click', () => sigModal.classList.add('hidden'));
clearSigBtn.addEventListener('click', () => signaturePad.clear());

confirmSigBtn.addEventListener('click', () => {
    if (signaturePad.isEmpty()) return;
    const imgData = signaturePad.toDataURL('image/png');
    const img = document.createElement('img');
    img.src = imgData;
    img.style.width = '200px';
    const div = document.createElement('div');
    div.className = 'draggable signature-element';
    div.style.top = '100px';
    div.style.left = '100px';
    div.appendChild(img);
    pdfContainer.appendChild(div);
    makeDraggable(div);
    sigModal.classList.add('hidden');
});

// --- שמירה ושיתוף (הלוגיקה המשופרת) ---
saveBtn.addEventListener('click', async () => {
    if (!pdfDoc) return;
    
    // חיווי למשתמש שהתהליך התחיל
    saveBtn.innerText = 'מעבד...';
    
    try {
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        
        const renderedWidth = parseFloat(pdfContainer.dataset.pdfWidth);
        const renderedHeight = parseFloat(pdfContainer.dataset.pdfHeight);
        const scaleX = width / renderedWidth;
        const scaleY = height / renderedHeight;

        // הטמעת טקסט
        const inputs = pdfContainer.querySelectorAll('.text-input');
        for (const input of inputs) {
            const wrapper = input.parentElement;
            const text = input.value;
            const x = wrapper.offsetLeft * scaleX;
            const y = height - (wrapper.offsetTop * scaleY) - (12 * scaleY);
            firstPage.drawText(text, { x, y, size: 16 * scaleY, color: PDFLib.rgb(0, 0, 0) });
        }

        // הטמעת חתימות
        const sigs = pdfContainer.querySelectorAll('.signature-element img');
        for (const img of sigs) {
            const wrapper = img.parentElement;
            const imageBytes = await fetch(img.src).then(res => res.arrayBuffer());
            const pngImage = await pdfDoc.embedPng(imageBytes);
            const x = wrapper.offsetLeft * scaleX;
            const pdfImgHeight = img.offsetHeight * scaleY;
            const y = height - (wrapper.offsetTop * scaleY) - pdfImgHeight;
            
            firstPage.drawImage(pngImage, { 
                x, y, 
                width: img.offsetWidth * scaleX, 
                height: pdfImgHeight 
            });
        }

        const modifiedPdfBytes = await pdfDoc.save();
        const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
        const file = new File([blob], "signed_document.pdf", { type: "application/pdf" });

        // ניסיון שיתוף (מועדף במובייל)
        if (navigator.share && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'מסמך חתום',
                    text: 'מצורף המסמך החתום.'
                });
                saveBtn.innerText = 'נשלח בהצלחה!';
            } catch (err) {
                console.log('Share canceled/failed', err);
                // אם השיתוף נכשל או בוטל, ננסה להוריד רגיל
                downloadFile(blob);
            }
        } else {
            // הורדה רגילה במחשב
            downloadFile(blob);
        }

    } catch (err) {
        alert("שגיאה בשמירה: " + err.message);
    } finally {
        setTimeout(() => saveBtn.innerText = 'Save & Download', 2000);
    }
});

const downloadFile = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signed_document.pdf';
    document.body.appendChild(a); // נדרש לפעמים בפיירפוקס
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
