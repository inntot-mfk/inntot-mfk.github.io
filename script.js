import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js"
const GRADIO_URL = "https://20601bb99f79cc430e.gradio.live";
const WAKE_WORDS = [
	{ id: "alexa", label: "Alexa" },
	{ id: "hi_alexa", label: "Hi Alexa" },
	{ id: "hey_alexa", label: "Hey Alexa" },
	{ id: "google", label: "Google" },
	{ id: "hi_google", label: "Hi Google" },
	{ id: "hey_google", label: "Hey Google" },
	{ id: "siri", label: "Siri" },
	{ id: "hi_siri", label: "Hi Siri" },
	{ id: "hey_siri", label: "Hey Siri" },
];

let appClient;
let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let isRecording = false;
let mimeType = 'audio/webm';
let completedWords = new Set();
let audioContext;
let analyser;
let dataArray;
let animationId;

const select = document.getElementById('wakeWordSelect');
const badgeContainer = document.getElementById('badgeContainer');
const micWrapper = document.getElementById('micWrapper');
const levelBar = document.getElementById('levelBar');
const visualizerContainer = document.getElementById('visualizerContainer');

function renderUI() {
	badgeContainer.innerHTML = '';
	WAKE_WORDS.forEach(word => {
		const isDone = completedWords.has(word.id);
		const badge = document.createElement('div');
		badge.className = `badge ${isDone ? 'done' : ''}`;
		badge.innerHTML = isDone ? `<i class="fa-solid fa-check"></i> ${word.label}` : word.label;
		badge.onclick = () => {
			select.value = word.id;
			updateSelectVisuals();
		};
		badgeContainer.appendChild(badge);
	});

	const count = completedWords.size;
	const total = WAKE_WORDS.length;
	const textEl = document.getElementById('progressText');
	
	if(count === total) {
		textEl.innerText = "🎉 All Done! Great job!";
		textEl.style.color = "var(--success-color)";
	} else {
		textEl.innerText = `${total - count} more to go`;
		textEl.style.color = "var(--primary-color)";
	}
}

function initDropdown() {
	select.innerHTML = '';
	WAKE_WORDS.forEach(word => {
		const opt = document.createElement('option');
		opt.value = word.id;
		opt.innerText = word.label;
		select.appendChild(opt);
	});
	
	select.addEventListener('change', updateSelectVisuals);
}

function updateSelectVisuals() {
	const currentVal = select.value;
	Array.from(badgeContainer.children).forEach((badge, idx) => {
		if(WAKE_WORDS[idx].id === currentVal) badge.classList.add('active');
		else badge.classList.remove('active');
	});
}

initDropdown();
renderUI();
updateSelectVisuals();

async function init() {
	try {
		appClient = await Client.connect(GRADIO_URL);
		document.getElementById('statusBadge').innerText = "System Ready";
		document.getElementById('statusBadge').style.background = "#dcfce7";
		document.getElementById('statusBadge').style.color = "#166534";
	} catch (e) {
		document.getElementById('statusBadge').innerText = "Connection Failed";
		document.getElementById('statusBadge').style.background = "#fee2e2";
		document.getElementById('statusBadge').style.color = "#991b1b";
	}
}
init();

function startVisualizer(stream) {
	audioContext = new (window.AudioContext || window.webkitAudioContext)();
	const source = audioContext.createMediaStreamSource(stream);
	analyser = audioContext.createAnalyser();
	analyser.fftSize = 256;
	
	source.connect(analyser);
	dataArray = new Uint8Array(analyser.frequencyBinCount);

	function draw() {
		analyser.getByteFrequencyData(dataArray);
		let sum = 0;
		for(let i = 0; i < dataArray.length; i++) {
			sum += dataArray[i];
		}
		let average = sum / dataArray.length;

		const percentage = Math.min(100, (average / 100) * 100); 

		levelBar.style.width = `${percentage}%`;

		animationId = requestAnimationFrame(draw);
	}
	draw();
}

function stopVisualizer() {
	if (animationId) cancelAnimationFrame(animationId);
	if (audioContext) audioContext.close();
	levelBar.style.width = '0%';
}

document.getElementById('recordBtn').onclick = async () => {
	if (!isRecording) {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			
			const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
			mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
			
			mediaRecorder = new MediaRecorder(stream, { mimeType });
			audioChunks = [];
			
			mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
			mediaRecorder.onstop = () => {
				audioBlob = new Blob(audioChunks, { type: mimeType });
				document.getElementById('audioPreview').src = URL.createObjectURL(audioBlob);
				document.getElementById('previewSection').classList.add('show');
				
				stream.getTracks().forEach(t => t.stop());
				stopVisualizer();
			};

			mediaRecorder.start();
			startVisualizer(stream);

			isRecording = true;
			document.getElementById('recordBtn').innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
			
			micWrapper.classList.add('active');
			visualizerContainer.classList.add('recording-active');
			
			document.getElementById('resultSection').classList.remove('show');
		} catch (err) {
			alert("Microphone Access Error: " + err.message);
		}
	} else {
		mediaRecorder.stop();
		isRecording = false;
		document.getElementById('recordBtn').innerHTML = '<i class="fa-solid fa-circle"></i> Record Again';
		
		micWrapper.classList.remove('active');
		visualizerContainer.classList.remove('recording-active');
	}
};

document.getElementById('uploadBtn').onclick = async () => {
	const btn = document.getElementById('uploadBtn');
	const resultBox = document.getElementById('resultSection');
	
	btn.disabled = true;
	btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
	
	try {
		const wakeWord = select.value;
		
		let ext = "webm";
		if (mimeType.includes("mp4")) ext = "mp4";
		else if (mimeType.includes("wav")) ext = "wav";

		const file = new File([audioBlob], `audio.${ext}`, { type: mimeType });

		const result = await appClient.predict("/predict", [file, wakeWord]);

		resultBox.innerText = result.data[1]; 
		resultBox.classList.add('show');
		document.getElementById('previewSection').classList.remove('show');

		completedWords.add(wakeWord);
		renderUI();
		
		const nextWord = WAKE_WORDS.find(w => !completedWords.has(w.id));
		if(nextWord) {
			select.value = nextWord.id;
			updateSelectVisuals();
		}

	} catch (err) {
		alert("Error: " + err.message);
	} finally {
		btn.disabled = false;
		btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload Data';
		document.getElementById('recordBtn').innerHTML = '<i class="fa-solid fa-circle"></i> Record Next Word';
	}
};
