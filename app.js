// --- DOM Elements ---
const fileInput = document.getElementById('file-upload');
const pdfContainer = document.getElementById('pdf-container');
const saveBtn = document.getElementById('save-btn');
const shareBtn = document.getElementById('share-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addSigBtn = document.getElementById('add-sig-btn');

// Modal Elements
const sigModal = document.getElementById('signature-modal');
const sigCanvas = document.getElementById('sig-canvas');
const clearSigBtn = document.getElementById('clear-sig');
const confirmSigBtn = document.getElementById('confirm-sig');
const cancelSigBtn = document.getElementById('cancel-sig');

// --- State ---
let pdfDoc = null; // The PDF-lib document
let pdfBytes = null; // Raw PDF bytes
let pageNum = 1; // Currently editing page 1 (MVP limitation)
let scale = 1.5; // Viewport scale
let signaturePad = null;

// --- Initialization ---
const initSignaturePad = () => {
    signaturePad = new SignaturePad(sigCanvas, { minWidth: 1, maxWidth: 3 });
    // Resize canvas for high DPI
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    sigCanvas.width = sigCanvas.offsetWidth * ratio;
    sigCanvas.height = sigCanvas.offsetHeight * ratio;
    sigCanvas.getContext("2d").scale(ratio, ratio);
};

// --- PDF Rendering (View) ---
const renderPDF = async (uint8Array) => {
    // 1. Load document in PDF.js for rendering
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale });
    
    // Create Canvas for Background
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Set container dimensions
    pdfContainer.style.width = `${viewport.width}px`;
    pdfContainer.style.height = `${viewport.height}px`;
    pdfContainer.innerHTML = ''; // Clear previous
    pdfContainer.appendChild(canvas);

    // Render PDF page to canvas
    await page.render({ canvasContext: context, viewport }).promise;

    // 2. Load document in PDF-Lib for Editing (Logic)
    pdfDoc = await PDFLib.PDFDocument.load(uint8Array);
    
    // Enable buttons
    saveBtn.disabled = false;
    addTextBtn.disabled = false;
    addSigBtn.disabled = false;
    
    // Store scale info for saving
    pdfContainer.dataset.pdfWidth = viewport.width;
    pdfContainer.dataset.pdfHeight = viewport.height;
};

// --- File Handling ---
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            pdfBytes = new Uint8Array(ev.target.result);
            renderPDF(pdfBytes);
        };
        reader.readAsArrayBuffer(file);
    }
});

// --- UI Interaction (Adding Elements) ---

// Helper: Make element draggable
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
        e.preventDefault(); // Prevent scroll on mobile
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

// Add Text
addTextBtn.addEventListener('click', () => {
    const div = document.createElement('div');
    div.className = 'draggable';
    div.style.top = '50px';
    div.style.left = '50px';
    
    const input = document.createElement('input');
    input.className = 'text-input';
    input.value = 'Text Here';
    input.type = 'text';
    
    div.appendChild(input);
    pdfContainer.appendChild(div);
    makeDraggable(div);
    input.focus();
});

// Add Signature Handling
addSigBtn.addEventListener('click', () => {
    sigModal.classList.remove('hidden');
    if (!signaturePad) initSignaturePad();
    signaturePad.clear();
});

cancelSigBtn.addEventListener('click', () => sigModal.classList.add('hidden'));
clearSigBtn.addEventListener('click', () => signaturePad.clear());

confirmSigBtn.addEventListener('click', () => {
    if (signaturePad.isEmpty()) return;
    
    const imgData = signaturePad.toDataURL('image/png');
    const img = document.createElement('img');
    img.src = imgData;
    img.style.width = '200px'; // Visual width
    
    const div = document.createElement('div');
    div.className = 'draggable signature-element';
    div.style.top = '100px';
    div.style.left = '100px';
    div.appendChild(img);
    
    pdfContainer.appendChild(div);
    makeDraggable(div);
    
    sigModal.classList.add('hidden');
});

// --- Saving Logic (The hard part) ---
const savePDF = async () => {
    try {
        const pages = pdfDoc.getPages();
        const firstPage = pages[0]; // Editing page 1
        const { width, height } = firstPage.getSize();
        
        // Rendered dimensions
        const renderedWidth = parseFloat(pdfContainer.dataset.pdfWidth);
        const renderedHeight = parseFloat(pdfContainer.dataset.pdfHeight);
        
        // Calculate scale ratio between CSS pixels and PDF points
        const scaleX = width / renderedWidth;
        const scaleY = height / renderedHeight;

        // Process Text Inputs
        const inputs = pdfContainer.querySelectorAll('.text-input');
        for (const input of inputs) {
            const wrapper = input.parentElement;
            const text = input.value;
            // PDF coordinate system is bottom-left, DOM is top-left
            const x = wrapper.offsetLeft * scaleX;
            // y calculation: PDF Height - (Top offset * scale) - (Approx text height adjustment)
            const y = height - (wrapper.offsetTop * scaleY) - (12 * scaleY); // 12 is approx font size adjustment
            
            firstPage.drawText(text, {
                x: x,
                y: y,
                size: 16 * scaleY, // Scale font size
                color: PDFLib.rgb(0, 0, 0),
            });
        }

        // Process Signatures
        const sigs = pdfContainer.querySelectorAll('.signature-element img');
        for (const img of sigs) {
            const wrapper = img.parentElement;
            const imageBytes = await fetch(img.src).then(res => res.arrayBuffer());
            const pngImage = await pdfDoc.embedPng(imageBytes);
            
            const imgDims = pngImage.scale(0.5); // Default scaling
            
            // Adjust visual size to PDF size
            // We need to match the visual aspect ratio to the PDF coordinates
            const visualWidth = img.offsetWidth;
            const visualHeight = img.offsetHeight;
            
            const pdfImgWidth = visualWidth * scaleX;
            const pdfImgHeight = visualHeight * scaleY;

            const x = wrapper.offsetLeft * scaleX;
            const y = height - (wrapper.offsetTop * scaleY) - pdfImgHeight;

            firstPage.drawImage(pngImage, {
                x: x,
                y: y,
                width: pdfImgWidth,
                height: pdfImgHeight,
            });
        }

        const modifiedPdfBytes = await pdfDoc.save();
        return modifiedPdfBytes;

    } catch (err) {
        console.error("Save error:", err);
        alert("Error saving PDF.");
    }
};

saveBtn.addEventListener('click', async () => {
    const bytes = await savePDF();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signed-document.pdf';
    a.click();
    
    // Enable share if supported
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'doc.pdf', { type: 'application/pdf' })] })) {
        shareBtn.disabled = false;
        shareBtn.onclick = () => sharePDF(blob);
    }
});

const sharePDF = async (blob) => {
    const file = new File([blob], "signed.pdf", { type: "application/pdf" });
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Signed PDF',
                text: 'Here is the signed document.',
                files: [file]
            });
        } catch (err) {
            console.error('Share failed', err);
        }
    }
};
