class ImageGenerator {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.checkServerStatus();
    }

    initializeElements() {
        this.promptInput = document.getElementById('prompt');
        this.negativePromptInput = document.getElementById('negative-prompt');
        this.widthInput = document.getElementById('width');
        this.heightInput = document.getElementById('height');
        this.stepsInput = document.getElementById('steps');
        this.cfgInput = document.getElementById('cfg');
        this.seedInput = document.getElementById('seed');
        this.generateBtn = document.getElementById('generate-btn');
        this.statusDiv = document.getElementById('status');
        this.loadingDiv = document.getElementById('loading');
        this.resultDiv = document.getElementById('result');
        this.generatedImage = document.getElementById('generated-image');
        this.downloadBtn = document.getElementById('download-btn');
    }

    bindEvents() {
        this.generateBtn.addEventListener('click', () => this.generateImage());
        this.downloadBtn.addEventListener('click', () => this.downloadImage());
    }

    showStatus(message, type = 'info') {
        this.statusDiv.textContent = message;
        this.statusDiv.className = `status ${type}`;
    }

    showLoading(show = true) {
        this.loadingDiv.classList.toggle('hidden', !show);
        this.generateBtn.disabled = show;
    }

    showResult(show = true) {
        this.resultDiv.classList.toggle('hidden', !show);
    }

    async checkServerStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data.status === 'connected') {
                this.showStatus('Ready to generate images', 'success');
            } else {
                this.showStatus('ComfyUI server not available', 'error');
            }
        } catch (error) {
            this.showStatus('Server connection failed', 'error');
        }
    }

    async generateImage() {
        try {
            const prompt = this.promptInput.value.trim();
            if (!prompt) {
                this.showStatus('Please enter a prompt', 'error');
                return;
            }

            this.showStatus('Generating image...');
            this.showLoading(true);
            this.showResult(false);

            const requestData = {
                prompt: prompt,
                negativePrompt: this.negativePromptInput.value,
                width: parseInt(this.widthInput.value) || 512,
                height: parseInt(this.heightInput.value) || 512,
                steps: parseInt(this.stepsInput.value) || 15,
                cfg: parseFloat(this.cfgInput.value) || 4,
                seed: this.seedInput.value ? parseInt(this.seedInput.value) : null
            };

            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Generation failed');
            }

            if (result.success && result.imageUrl) {
                // Use proxy endpoint to serve the image
                const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(result.imageUrl)}`;
                this.generatedImage.src = proxyUrl;
                
                this.generatedImage.onload = () => {
                    this.showLoading(false);
                    this.showResult(true);
                    this.showStatus('Image generated successfully!', 'success');
                };

                this.generatedImage.onerror = () => {
                    this.showLoading(false);
                    this.showStatus('Failed to load generated image', 'error');
                };
            } else {
                throw new Error('Invalid response from server');
            }

        } catch (error) {
            this.showLoading(false);
            this.showStatus(`Error: ${error.message}`, 'error');
            console.error('Generation failed:', error);
        }
    }

    downloadImage() {
        if (this.generatedImage.src) {
            const link = document.createElement('a');
            link.href = this.generatedImage.src;
            link.download = `generated-image-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ImageGenerator();
});