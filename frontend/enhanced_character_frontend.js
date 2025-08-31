/* enhanced_character_frontend.js
   Enhanced character creation with backend API integration
   Replace the character-related functions in your script.js with these
*/

// API Configuration
const API_BASE_URL = 'http://localhost:8000'; // Adjust for your backend URL

// API Helper functions
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || `API Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Enhanced character creation with AI generation
function initCharacter() {
    // DOM elements
    const nameInput = $('#c-name'), ageInput = $('#c-age'), heightInput = $('#c-height'), descInput = $('#c-desc');
    const genBtn = $('#generate-candidates'), regenBtn = $('#regenerate-candidates'), grid = $('#candidate-grid');
    const listEl = $('#character-list'), managePanel = $('#char-manage'), manageTitle = $('#manage-title'), manageId = $('#manage-id');

    // Add loading state management
    let isGenerating = false;

    async function generateCandidates() {
        const name = nameInput.value.trim();
        const age = ageInput.value.trim();
        const height = heightInput.value.trim();
        const desc = descInput.value.trim();
        
        if (!name) {
            alert('Enter a character name first');
            return;
        }

        if (isGenerating) {
            alert('Generation in progress, please wait...');
            return;
        }

        isGenerating = true;
        genBtn.disabled = true;
        regenBtn.disabled = true;
        genBtn.textContent = 'Generating...';
        
        grid.innerHTML = '<div class="loading">🎨 Generating manga character variants... This may take 30-60 seconds</div>';

        try {
            const response = await apiCall('/characters/generate-variants', {
                method: 'POST',
                body: JSON.stringify({
                    name: name,
                    description: desc || null,
                    age: age ? parseInt(age) : null,
                    height_cm: height ? parseFloat(height) : null
                })
            });

            grid.innerHTML = '';
            
            if (response.variants && response.variants.length > 0) {
                response.variants.forEach((variant, i) => {
                    const card = document.createElement('div');
                    card.className = 'card variant-card';
                    card.innerHTML = `
                        <div class="variant-image">
                            <img src="${variant.image_url}" alt="Variant ${variant.variant_id}" 
                                 style="width: 100%; height: 150px; object-fit: cover; border-radius: 6px;">
                        </div>
                        <div class="small" style="margin: 8px 0; text-align: left;">
                            <strong>Variant ${variant.variant_id}</strong><br>
                            <span style="color: #6b7280;">${variant.style}</span>
                        </div>
                        <div style="margin-top: 8px;">
                            <button class="btn btn-select" data-variant="${i}">Select This</button>
                        </div>
                    `;
                    
                    // Select button saves character with this avatar
                    card.querySelector('.btn-select').addEventListener('click', async () => {
                        try {
                            const characterData = {
                                name: name,
                                description: desc || null,
                                age: age ? parseInt(age) : null,
                                height_cm: height ? parseFloat(height) : null,
                                avatar_url: variant.image_url
                            };

                            const newCharacter = await apiCall('/characters', {
                                method: 'POST',
                                body: JSON.stringify(characterData)
                            });

                            alert(`Character ${newCharacter.char_code} saved successfully!`);
                            
                            // Clear form and refresh list
                            nameInput.value = '';
                            ageInput.value = '';
                            heightInput.value = '';
                            descInput.value = '';
                            grid.innerHTML = '';
                            
                            await renderCharacterList();
                            openManage(newCharacter.id);
                            
                        } catch (error) {
                            alert(`Failed to save character: ${error.message}`);
                        }
                    });
                    
                    grid.appendChild(card);
                });
            } else {
                grid.innerHTML = '<div class="small">No variants generated. Try a different description.</div>';
            }

        } catch (error) {
            grid.innerHTML = `<div class="error">Generation failed: ${error.message}</div>`;
            console.error('Generation error:', error);
        } finally {
            isGenerating = false;
            genBtn.disabled = false;
            regenBtn.disabled = false;
            genBtn.textContent = 'Generate Character';
        }
    }

    async function renderCharacterList() {
        try {
            const characters = await apiCall('/characters');
            
            listEl.innerHTML = '';
            if (characters.length === 0) {
                listEl.innerHTML = '<div class="small">No characters yet. Create one above.</div>';
                return;
            }

            characters.forEach(c => {
                const item = document.createElement('div');
                item.className = 'item character-item';
                
                const avatarHtml = c.avatar_url ? 
                    `<img src="${c.avatar_url}" alt="${c.name}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover; margin-right: 10px;">` : 
                    '<div style="width: 40px; height: 40px; background: #e2e8f0; border-radius: 6px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 12px;">No Image</div>';
                
                item.innerHTML = `
                    <div style="display: flex; align-items: center;">
                        ${avatarHtml}
                        <div>
                            <div style="font-weight: 700">${c.name || 'Unnamed'}</div>
                            <div class="small">${c.char_code}${c.age ? ' • Age ' + c.age : ''}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-manage" data-id="${c.id}">Manage</button>
                        <button class="btn btn-regenerate" data-id="${c.id}" style="background: #059669;">New Avatar</button>
                        <button class="btn btn-delete" data-id="${c.id}" style="background: #ef4444;">Delete</button>
                    </div>
                `;
                
                listEl.appendChild(item);
            });

            // Wire up buttons
            $$('.btn-manage', listEl).forEach(btn => {
                btn.addEventListener('click', (e) => openManage(parseInt(e.target.dataset.id)));
            });

            $$('.btn-regenerate', listEl).forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (!confirm('Generate a new avatar for this character?')) return;
                    
                    const characterId = parseInt(e.target.dataset.id);
                    const button = e.target;
                    const originalText = button.textContent;
                    
                    try {
                        button.disabled = true;
                        button.textContent = 'Generating...';
                        
                        await apiCall(`/characters/${characterId}/generate-avatar`, {
                            method: 'POST'
                        });
                        
                        alert('New avatar generated successfully!');
                        await renderCharacterList();
                        
                    } catch (error) {
                        alert(`Avatar generation failed: ${error.message}`);
                    } finally {
                        button.disabled = false;
                        button.textContent = originalText;
                    }
                });
            });

            $$('.btn-delete', listEl).forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (!confirm('Delete this character?')) return;
                    
                    try {
                        const characterId = parseInt(e.target.dataset.id);
                        await apiCall(`/characters/${characterId}`, { method: 'DELETE' });
                        await renderCharacterList();
                        alert('Character deleted successfully');
                    } catch (error) {
                        alert(`Failed to delete character: ${error.message}`);
                    }
                });
            });

        } catch (error) {
            listEl.innerHTML = `<div class="error">Failed to load characters: ${error.message}</div>`;
        }
    }

    let selectedCharacterId = null;
    let selectedCharacterData = null;

    async function openManage(characterId) {
        try {
            const character = await apiCall(`/characters/${characterId}`);
            selectedCharacterId = characterId;
            selectedCharacterData = character;
            
            managePanel.style.display = 'block';
            manageTitle.textContent = character.name;
            manageId.textContent = character.char_code;
            
            // For now, keep the existing costume/age/changes management
            // These could be enhanced later with separate API endpoints
            renderCostumes();
            renderAges();
            renderChanges();
            
        } catch (error) {
            alert(`Failed to load character: ${error.message}`);
        }
    }

    // Keep existing costume/age/changes functions but modify to work with API data
    function renderCostumes() {
        const costumeList = $('#costume-list');
        costumeList.innerHTML = '';
        
        if (!selectedCharacterData || !selectedCharacterData.costumes || selectedCharacterData.costumes.length === 0) {
            costumeList.innerHTML = '<div class="small">No costumes yet.</div>';
            return;
        }
        
        selectedCharacterData.costumes.forEach(costume => {
            const el = document.createElement('div');
            el.className = 'item';
            el.innerHTML = `
                <div>
                    <div style="font-weight: 700">${costume.name}</div>
                    <div class="small">${costume.id}</div>
                </div>
                <div>
                    ${costume.isDefault ? '<span class="small">Default</span>' : ''}
                    <button class="btn" data-action="del" data-id="${costume.id}">Delete</button>
                </div>
            `;
            costumeList.appendChild(el);
        });
    }

    function renderAges() {
        const ageList = $('#age-list');
        ageList.innerHTML = '';
        
        if (!selectedCharacterData || !selectedCharacterData.ages || selectedCharacterData.ages.length === 0) {
            ageList.innerHTML = '<div class="small">No age states yet.</div>';
            return;
        }
        
        selectedCharacterData.ages.forEach(age => {
            const el = document.createElement('div');
            el.className = 'item';
            el.innerHTML = `
                <div>
                    <div style="font-weight: 700">Age ${age.age}</div>
                    <div class="small">${age.id}</div>
                </div>
                <div>
                    <button class="btn" data-id="${age.id}" data-action="del">Delete</button>
                </div>
            `;
            ageList.appendChild(el);
        });
    }

    function renderChanges() {
        const changeList = $('#change-list');
        changeList.innerHTML = '';
        
        if (!selectedCharacterData || !selectedCharacterData.changes || selectedCharacterData.changes.length === 0) {
            changeList.innerHTML = '<div class="small">No changes yet.</div>';
            return;
        }
        
        selectedCharacterData.changes.forEach(change => {
            const el = document.createElement('div');
            el.className = 'item';
            el.innerHTML = `
                <div>
                    <div style="font-weight: 700">${change.when || 'When unspecified'}</div>
                    <div class="small">${change.id}</div>
                </div>
                <div>
                    <button class="btn" data-id="${change.id}" data-action="del">Delete</button>
                </div>
            `;
            changeList.appendChild(el);
        });
    }

    // Attach event listeners
    genBtn.addEventListener('click', generateCandidates);
    regenBtn.addEventListener('click', generateCandidates);

    // Initialize the page
    renderCharacterList();
}

// Enhanced utility function for displaying loading states
function showLoading(element, message = 'Loading...') {
    element.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; padding: 20px; color: #6b7280;">
            <div style="margin-right: 10px;">⏳</div>
            <div>${message}</div>
        </div>
    `;
}

// Error handling utility
function showError(element, message) {
    element.innerHTML = `
        <div style="background: #fee2e2; color: #dc2626; padding: 12px; border-radius: 8px; margin: 10px 0;">
            <strong>Error:</strong> ${message}
        </div>
    `;
}

// Add search functionality
async function searchCharacters(searchParams) {
    try {
        const queryParams = new URLSearchParams();
        if (searchParams.name) queryParams.append('name', searchParams.name);
        if (searchParams.min_age) queryParams.append('min_age', searchParams.min_age);
        if (searchParams.max_age) queryParams.append('max_age', searchParams.max_age);
        
        return await apiCall(`/characters/search?${queryParams.toString()}`);
    } catch (error) {
        console.error('Search failed:', error);
        throw error;
    }
}

// Bulk character generation utility
async function bulkGenerateCharacters(characterList) {
    try {
        return await apiCall('/characters/bulk-generate', {
            method: 'POST',
            body: JSON.stringify({ characters: characterList })
        });
    } catch (error) {
        console.error('Bulk generation failed:', error);
        throw error;
    }
}

// Health check for image generation service
async function checkImageGenerationHealth() {
    try {
        return await apiCall('/health/image-generation');
    } catch (error) {
        console.error('Health check failed:', error);
        return { status: 'unhealthy', error: error.message };
    }
}

// Enhanced styles for the new features (add to your CSS)
const enhancedStyles = `
.variant-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.variant-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.1);
}

.character-item {
    transition: background-color 0.2s ease;
}

.character-item:hover {
    background-color: #f8fafc;
}

.loading {
    text-align: center;
    padding: 40px;
    color: #6b7280;
    font-style: italic;
}

.error {
    background: #fee2e2;
    color: #dc2626;
    padding: 16px;
    border-radius: 8px;
    text-align: center;
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.variant-image img {
    border: 2px solid transparent;
    transition: border-color 0.2s ease;
}

.variant-card:hover .variant-image img {
    border-color: var(--accent);
}
`;

// Inject enhanced styles
if (!document.querySelector('#enhanced-character-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'enhanced-character-styles';
    styleSheet.textContent = enhancedStyles;
    document.head.appendChild(styleSheet);
}

// Character management enhancement with costume generation
async function generateCostumeVariants(characterId, costumeName, costumeDescription) {
    try {
        const character = await apiCall(`/characters/${characterId}`);
        
        // Generate costume-specific images
        const prompt = `manga style character, ${character.name}, ${costumeDescription}, ${costumeName}, anime art style, character design sheet`;
        
        const response = await apiCall('/characters/generate-variants', {
            method: 'POST',
            body: JSON.stringify({
                name: character.name,
                description: `${character.description || ''} wearing ${costumeDescription}`,
                age: character.age
            })
        });
        
        return response.variants;
    } catch (error) {
        console.error('Costume generation failed:', error);
        throw error;
    }
}

// Add character import/export functionality
function exportCharacterData(characterData) {
    const dataStr = JSON.stringify(characterData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `character_${characterData.char_code}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

// Character batch operations
async function batchUpdateCharacters(updates) {
    const results = [];
    
    for (const update of updates) {
        try {
            const result = await apiCall(`/characters/${update.id}`, {
                method: 'PUT',
                body: JSON.stringify(update.data)
            });
            results.push({ success: true, character: result });
        } catch (error) {
            results.push({ success: false, error: error.message, id: update.id });
        }
    }
    
    return results;
}

// Add character analytics
function getCharacterAnalytics(characters) {
    if (!characters || characters.length === 0) {
        return {
            total: 0,
            averageAge: 0,
            ageGroups: {},
            hasAvatars: 0
        };
    }
    
    const validAges = characters.filter(c => c.age).map(c => c.age);
    const averageAge = validAges.length > 0 ? validAges.reduce((a, b) => a + b) / validAges.length : 0;
    
    const ageGroups = {
        'Child (0-12)': characters.filter(c => c.age && c.age <= 12).length,
        'Teen (13-19)': characters.filter(c => c.age && c.age >= 13 && c.age <= 19).length,
        'Adult (20-64)': characters.filter(c => c.age && c.age >= 20 && c.age <= 64).length,
        'Elder (65+)': characters.filter(c => c.age && c.age >= 65).length
    };
    
    return {
        total: characters.length,
        averageAge: Math.round(averageAge),
        ageGroups,
        hasAvatars: characters.filter(c => c.avatar_url).length
    };
}

// Initialize with health check
async function initializeWithHealthCheck() {
    const healthStatus = await checkImageGenerationHealth();
    
    if (healthStatus.status !== 'healthy') {
        console.warn('Image generation service health check failed:', healthStatus);
        
        // Show warning banner
        const warningBanner = document.createElement('div');
        warningBanner.style.cssText = `
            background: #fef3c7; 
            color: #92400e; 
            padding: 12px; 
            text-align: center; 
            border-radius: 8px; 
            margin-bottom: 16px;
            border: 1px solid #fcd34d;
        `;
        warningBanner.innerHTML = `
            <strong>Notice:</strong> Image generation service is ${healthStatus.status}. 
            Character creation will work but images may not generate.
        `;
        
        document.querySelector('.container').insertBefore(warningBanner, document.querySelector('.container').firstChild);
    }
}