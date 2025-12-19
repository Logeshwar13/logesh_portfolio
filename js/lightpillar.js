import * as THREE from 'three';

class LightPillar {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('❌ LightPillar: Container not found with ID:', containerId);
            return;
        }

        // Check if container has dimensions
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) {
            console.warn('⚠️ LightPillar: Container has zero dimensions. Width:', width, 'Height:', height);
            console.warn('⚠️ Make sure the container has a defined size in CSS');
        }

        // Options with defaults
        this.options = {
            topColor: options.topColor || '#5227FF',
            bottomColor: options.bottomColor || '#FF9FFC',
            intensity: options.intensity || 1.0,
            rotationSpeed: options.rotationSpeed || 0.3,
            interactive: options.interactive || false,
            glowAmount: options.glowAmount || 0.005,
            pillarWidth: options.pillarWidth || 3.0,
            pillarHeight: options.pillarHeight || 0.4,
            noiseIntensity: options.noiseIntensity || 0.5,
            pillarRotation: options.pillarRotation || 0,
            mixBlendMode: options.mixBlendMode || 'normal'
        };

        this.mouse = new THREE.Vector2(0, 0);
        this.time = 0;
        this.rafId = null;

        this.init();
    }

    init() {
        // Check WebGL support
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            this.showFallback();
            return;
        }

        this.setupScene();
        this.setupRenderer();
        this.setupMaterial();
        this.setupMesh();
        this.setupEventListeners();
        this.animate();
    }

    setupScene() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }

    setupRenderer() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        try {
            this.renderer = new THREE.WebGLRenderer({
                antialias: false,
                alpha: true,
                powerPreference: 'high-performance',
                precision: 'lowp',
                stencil: false,
                depth: false
            });

            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.container.appendChild(this.renderer.domElement);
            this.renderer.domElement.style.mixBlendMode = this.options.mixBlendMode;
        } catch (error) {
            console.error('Failed to create WebGL renderer:', error);
            this.showFallback();
        }
    }

    parseColor(hex) {
        const color = new THREE.Color(hex);
        return new THREE.Vector3(color.r, color.g, color.b);
    }

    setupMaterial() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

        const fragmentShader = `
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uMouse;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform float uIntensity;
      uniform bool uInteractive;
      uniform float uGlowAmount;
      uniform float uPillarWidth;
      uniform float uPillarHeight;
      uniform float uNoiseIntensity;
      uniform float uPillarRotation;
      varying vec2 vUv;

      const float PI = 3.141592653589793;
      const float EPSILON = 0.001;
      const float E = 2.71828182845904523536;
      const float HALF = 0.5;

      mat2 rot(float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return mat2(c, -s, s, c);
      }

      float noise(vec2 coord) {
        float G = E;
        vec2 r = (G * sin(G * coord));
        return fract(r.x * r.y * (1.0 + coord.x));
      }

      vec3 applyWaveDeformation(vec3 pos, float timeOffset) {
        float frequency = 1.0;
        float amplitude = 1.0;
        vec3 deformed = pos;
        
        for(float i = 0.0; i < 4.0; i++) {
          deformed.xz *= rot(0.4);
          float phase = timeOffset * i * 2.0;
          vec3 oscillation = cos(deformed.zxy * frequency - phase);
          deformed += oscillation * amplitude;
          frequency *= 2.0;
          amplitude *= HALF;
        }
        return deformed;
      }

      float blendMin(float a, float b, float k) {
        float scaledK = k * 4.0;
        float h = max(scaledK - abs(a - b), 0.0);
        return min(a, b) - h * h * 0.25 / scaledK;
      }

      float blendMax(float a, float b, float k) {
        return -blendMin(-a, -b, k);
      }

      void main() {
        vec2 fragCoord = vUv * uResolution;
        vec2 uv = (fragCoord * 2.0 - uResolution) / uResolution.y;
        
        float rotAngle = uPillarRotation * PI / 180.0;
        uv *= rot(rotAngle);

        vec3 origin = vec3(0.0, 0.0, -10.0);
        vec3 direction = normalize(vec3(uv, 1.0));

        float maxDepth = 50.0;
        float depth = 0.1;

        mat2 rotX = rot(uTime * 0.3);
        if(uInteractive && length(uMouse) > 0.0) {
          rotX = rot(uMouse.x * PI * 2.0);
        }

        vec3 color = vec3(0.0);
        
        for(float i = 0.0; i < 100.0; i++) {
          vec3 pos = origin + direction * depth;
          pos.xz *= rotX;

          vec3 deformed = pos;
          deformed.y *= uPillarHeight;
          deformed = applyWaveDeformation(deformed + vec3(0.0, uTime, 0.0), uTime);
          
          vec2 cosinePair = cos(deformed.xz);
          float fieldDistance = length(cosinePair) - 0.2;
          
          float radialBound = length(pos.xz) - uPillarWidth;
          fieldDistance = blendMax(radialBound, fieldDistance, 1.0);
          fieldDistance = abs(fieldDistance) * 0.15 + 0.01;

          vec3 gradient = mix(uBottomColor, uTopColor, smoothstep(15.0, -15.0, pos.y));
          color += gradient * pow(1.0 / fieldDistance, 1.0);

          if(fieldDistance < EPSILON || depth > maxDepth) break;
          depth += fieldDistance;
        }

        float widthNormalization = uPillarWidth / 3.0;
        color = tanh(color * uGlowAmount / widthNormalization);
        
        float rnd = noise(gl_FragCoord.xy);
        color -= rnd / 15.0 * uNoiseIntensity;
        
        gl_FragColor = vec4(color * uIntensity, 1.0);
      }
    `;

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(width, height) },
                uMouse: { value: this.mouse },
                uTopColor: { value: this.parseColor(this.options.topColor) },
                uBottomColor: { value: this.parseColor(this.options.bottomColor) },
                uIntensity: { value: this.options.intensity },
                uInteractive: { value: this.options.interactive },
                uGlowAmount: { value: this.options.glowAmount },
                uPillarWidth: { value: this.options.pillarWidth },
                uPillarHeight: { value: this.options.pillarHeight },
                uNoiseIntensity: { value: this.options.noiseIntensity },
                uPillarRotation: { value: this.options.pillarRotation }
            },
            transparent: true,
            depthWrite: false,
            depthTest: false
        });
    }

    setupMesh() {
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);
    }

    setupEventListeners() {
        // Mouse interaction with throttling
        if (this.options.interactive) {
            let mouseMoveTimeout = null;
            this.handleMouseMove = (event) => {
                if (mouseMoveTimeout) return;

                mouseMoveTimeout = setTimeout(() => {
                    mouseMoveTimeout = null;
                }, 16);

                const rect = this.container.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                this.mouse.set(x, y);
            };

            this.container.addEventListener('mousemove', this.handleMouseMove, { passive: true });
        }

        // Resize handler with debouncing
        let resizeTimeout = null;
        this.handleResize = () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }

            resizeTimeout = setTimeout(() => {
                if (!this.renderer || !this.material || !this.container) return;
                const newWidth = this.container.clientWidth;
                const newHeight = this.container.clientHeight;
                this.renderer.setSize(newWidth, newHeight);
                this.material.uniforms.uResolution.value.set(newWidth, newHeight);
            }, 150);
        };

        window.addEventListener('resize', this.handleResize, { passive: true });
    }

    animate() {
        if (!this.material || !this.renderer || !this.scene || !this.camera) return;

        this.time += 0.016 * this.options.rotationSpeed;
        this.material.uniforms.uTime.value = this.time;
        this.renderer.render(this.scene, this.camera);

        this.rafId = requestAnimationFrame(() => this.animate());
    }

    showFallback() {
        // Silently fail - just set transparent background, no error message
        this.container.style.background = 'transparent';
        console.warn('⚠️ LightPillar: WebGL initialization failed, falling back to transparent background');
    }

    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }

        if (this.options.interactive && this.handleMouseMove) {
            this.container.removeEventListener('mousemove', this.handleMouseMove);
        }

        if (this.handleResize) {
            window.removeEventListener('resize', this.handleResize);
        }

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            if (this.container.contains(this.renderer.domElement)) {
                this.container.removeChild(this.renderer.domElement);
            }
        }

        if (this.material) {
            this.material.dispose();
        }

        if (this.geometry) {
            this.geometry.dispose();
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎨 Initializing LightPillar background...');

    const container = document.getElementById('lightpillar-container');
    if (!container) {
        console.error('❌ LightPillar container not found!');
        return;
    }

    console.log('✅ Container found:', container);
    console.log('📐 Container size:', container.clientWidth, 'x', container.clientHeight);

    const lightPillar = new LightPillar('lightpillar-container', {
        topColor: '#5227FF',
        bottomColor: '#FF9FFC',
        intensity: 1.0,
        rotationSpeed: 0.3,
        glowAmount: 0.005,
        pillarWidth: 3.0,
        pillarHeight: 0.4,
        noiseIntensity: 0.5,
        pillarRotation: 0,
        interactive: false,
        mixBlendMode: 'normal'
    });

    console.log('🚀 LightPillar initialized!');
});

export default LightPillar;
