$(document).ready(function () {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let painting = false;

    const subscriptionKey = '6dbaeac278164012a3dbd21a4dc5b5d1';
    const endpoint = 'https://memoapp.cognitiveservices.azure.com/';
    const ocrEndpoint = `${endpoint}/vision/v3.2/read/analyze`;

    function resizeCanvas() {
        const container = document.getElementById('canvasContainer');
        if (container) {
            canvas.width = container.offsetWidth;
            canvas.height = container.offsetHeight;
        }
    }

    function startPosition(e) {
        painting = true;
        draw(e);
    }

    function endPosition() {
        painting = false;
        ctx.beginPath();
    }

    function draw(e) {
        if (!painting) return;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';

        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    }

    $(window).on('resize', resizeCanvas);
    resizeCanvas();

    canvas.addEventListener('mousedown', startPosition);
    canvas.addEventListener('mouseup', endPosition);
    canvas.addEventListener('mousemove', draw);

    $('#clearCanvas').click(function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    $('#saveImage').click(function () {
        const canvas = document.getElementById('canvas');
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = 'drawing.png';
        link.click();
    });

    $(document).on("click", "#save", function () {
        const key = $("#key").val();
        const textContent = $("#textContent").html();
        const canvasData = canvas.toDataURL();

        localStorage.setItem(key, JSON.stringify({ text: textContent, drawing: canvasData }));

        const html = `<tr data-key="${key}"><th>${key}</th><td>${textContent}<br><img src="${canvasData}" width="100"></td><td><div class="icon-container"><i class="fas fa-edit edit-icon"></i><i class="fas fa-trash delete-icon"></i></div></td></tr>`;
        $("#list").append(html);

        $('#key').val('');
        $('#textContent').html('');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    $("#allclear").on("click", function () {
        localStorage.clear();
        $("#list").empty();
    });

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
            const { text, drawing } = JSON.parse(localStorage.getItem(key));
            const html = `<tr data-key="${key}"><th>${key}</th><td>${text}<br><img src="${drawing}" width="100"></td><td><div class="icon-container"><i class="fas fa-edit edit-icon"></i><i class="fas fa-trash delete-icon"></i></div></td></tr>`;
            $("#list").append(html);
        } catch (e) {
            console.error(`Error parsing JSON for key "${key}":`, e);
        }
    }

    $(document).on("click", ".edit-icon", function () {
        const $tr = $(this).closest("tr");
        const $th = $tr.find("th");
        const $td = $tr.find("td").first();
        const $img = $tr.find("img");

        const key = $th.text().trim();
        const content = $td.html();
        const drawing = $img.attr("src");

        $th.html('<input type="text" class="edit-key" value="' + key + '">');
        $td.html('<div contenteditable="true" class="edit-value">' + content.split('<br>')[0] + '</div>');
        $(this).closest("td").html('<div class="icon-container"><i class="fas fa-save save-edit"></i></div>');

        const img = new Image();
        img.onload = function () {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = drawing;
    });

    $(document).on("click", ".save-edit", function () {
        const $tr = $(this).closest("tr");
        const $th = $tr.find(".edit-key");
        const $td = $tr.find(".edit-value");

        const newKey = $th.val();
        const newContent = $td.html();
        const newDrawing = canvas.toDataURL();
        const oldKey = $tr.data("key");

        if (oldKey !== newKey) {
            localStorage.removeItem(oldKey);
        }
        localStorage.setItem(newKey, JSON.stringify({ text: newContent, drawing: newDrawing }));

        $tr.find("th").html(newKey);
        $tr.find("td").first().html(newContent + '<br><img src="' + newDrawing + '" width="100">');
        $tr.find("td").last().html('<div class="icon-container"><i class="fas fa-edit edit-icon"></i><i class="fas fa-trash delete-icon"></i></div>');

        $tr.attr("data-key", newKey);
    });

    $(document).on("click", ".delete-icon", function () {
        const $tr = $(this).closest("tr");
        const key = $tr.find("th").text().trim();
        localStorage.removeItem(key);
        $tr.remove();
    });

    $(document).on("click", "#recognize", async function () {
        const canvasData = canvas.toDataURL().split(',')[1];
        const binaryData = atob(canvasData);
        const byteArray = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
            byteArray[i] = binaryData.charCodeAt(i);
        }

        console.log('Sending OCR request...');

        try {
            const response = await axios.post(ocrEndpoint, byteArray.buffer, {
                headers: {
                    'Ocp-Apim-Subscription-Key': subscriptionKey,
                    'Content-Type': 'application/octet-stream'
                }
            });

            console.log('OCR response:', response.data);

            const operationLocation = response.headers['operation-location'];
            const result = await pollForResult(operationLocation);
            console.log('OCR result:', result);

            let recognizedText = '';
            if (result && result.analyzeResult && result.analyzeResult.readResults) {
                result.analyzeResult.readResults.forEach(readResult => {
                    readResult.lines.forEach(line => {
                        recognizedText += `${line.text}\n`;
                    });
                });
            }

            $('#textContent').html(recognizedText.trim());
        } catch (error) {
            console.error('Error recognizing text:', error);
        }
    });

    async function pollForResult(url) {
        let result;
        while (true) {
            const response = await axios.get(url, {
                headers: {
                    'Ocp-Apim-Subscription-Key': subscriptionKey
                }
            });
            result = response.data;
            if (result.status === 'succeeded' || result.status === 'failed') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before polling again
        }
        return result;
    }
});
