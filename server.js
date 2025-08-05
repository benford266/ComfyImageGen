const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = 3000;
const COMFYUI_URL = 'http://192.168.4.208:8188';

app.use(express.json());
app.use(express.static('.'));

let workflowTemplate = null;

async function loadWorkflowTemplate() {
    try {
        const data = await fs.readFile('./ComfyUIImagegen.json', 'utf8');
        workflowTemplate = JSON.parse(data);
        console.log('Workflow template loaded successfully');
    } catch (error) {
        console.error('Failed to load workflow template:', error);
    }
}

function prepareWorkflow(params) {
    if (!workflowTemplate) {
        throw new Error('Workflow template not loaded');
    }

    const workflow = JSON.parse(JSON.stringify(workflowTemplate));
    
    // Update prompt (node 6)
    workflow["6"].inputs.text = params.prompt || "a beautiful landscape";
    
    // Update negative prompt (node 7)
    workflow["7"].inputs.text = params.negativePrompt || "text, watermark";
    
    // Update image dimensions (node 5)
    workflow["5"].inputs.width = parseInt(params.width) || 512;
    workflow["5"].inputs.height = parseInt(params.height) || 512;
    
    // Update sampling parameters (node 3)
    workflow["3"].inputs.steps = parseInt(params.steps) || 15;
    workflow["3"].inputs.cfg = parseFloat(params.cfg) || 4;
    
    // Update seed
    workflow["3"].inputs.seed = params.seed ? parseInt(params.seed) : Math.floor(Math.random() * 1000000000000000);

    return workflow;
}

function generateClientId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function pollForCompletion(promptId, maxAttempts = 60) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Check queue status
            const queueResponse = await axios.get(`${COMFYUI_URL}/queue`);
            const queueData = queueResponse.data;
            
            // Check if prompt is still in queue
            const isInQueue = queueData.queue_running.some(item => item[1] === promptId) ||
                            queueData.queue_pending.some(item => item[1] === promptId);
            
            if (isInQueue) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            // Check history for completed generation
            const historyResponse = await axios.get(`${COMFYUI_URL}/history/${promptId}`);
            const historyData = historyResponse.data;
            
            if (historyData[promptId] && historyData[promptId].outputs) {
                const outputs = historyData[promptId].outputs;
                const saveImageOutput = outputs["9"];
                
                if (saveImageOutput && saveImageOutput.images && saveImageOutput.images.length > 0) {
                    const imageInfo = saveImageOutput.images[0];
                    return {
                        success: true,
                        imageUrl: `${COMFYUI_URL}/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder}&type=${imageInfo.type}`,
                        filename: imageInfo.filename
                    };
                }
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`Polling attempt ${attempt + 1} failed:`, error.message);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    throw new Error('Generation timed out');
}

app.post('/api/generate', async (req, res) => {
    try {
        const { prompt, negativePrompt, width, height, steps, cfg, seed } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const workflow = prepareWorkflow({
            prompt,
            negativePrompt,
            width,
            height,
            steps,
            cfg,
            seed
        });

        // Queue the prompt
        const queueResponse = await axios.post(`${COMFYUI_URL}/prompt`, {
            prompt: workflow,
            client_id: generateClientId()
        });

        const promptId = queueResponse.data.prompt_id;
        
        // Poll for completion
        const result = await pollForCompletion(promptId);
        
        res.json(result);

    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to generate image',
            details: error.response?.data || null
        });
    }
});

app.get('/api/proxy-image', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || !url.startsWith(COMFYUI_URL)) {
            return res.status(400).json({ error: 'Invalid image URL' });
        }

        const response = await axios.get(url, {
            responseType: 'stream'
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
        response.data.pipe(res);

    } catch (error) {
        console.error('Image proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch image' });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const response = await axios.get(`${COMFYUI_URL}/queue`);
        res.json({ 
            status: 'connected',
            queue: response.data 
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'disconnected',
            error: error.message 
        });
    }
});

loadWorkflowTemplate().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`ComfyUI endpoint: ${COMFYUI_URL}`);
    });
});