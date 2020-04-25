let dpr, creenWidth, screenHeight;
let quadBuffer;
let pointsBuffer;
let pointsBufferPosition = 0;

const SCALING = 4;
const POINTS_MAP_RESOLUTION = 32;

const canvas = document.getElementById('scene');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
if (!gl)
	throw "WebGL is not supported.";

const program = compileShader('paint', ['points'], ['vertexPosition']);
program.use();

allocPointsBuffer();
allocQuad();

resize();

function draw() {
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	gl.finish();
	
	requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

let isPressed = false;
canvas.addEventListener('mousedown', (e) => {
    isPressed = true;

    const x = e.clientX;
    const y = e.clientY;

    writeCoord(x * dpr, (screenHeight - y) * dpr, true);
});
canvas.addEventListener('mousemove', (e) => {
    const x = e.clientX;
    const y = e.clientY;

    if (isPressed)
        writeCoord(x * dpr, (screenHeight - y) * dpr);
});
canvas.addEventListener('mouseup', (e) => {
    const x = e.clientX;
    const y = e.clientY;

    if (isPressed) {
        writeCoord(x * dpr, (screenHeight - y) * dpr, true);
        writeTrail();
        isPressed = false;
    }
});
canvas.addEventListener('mouseleave', (e) => {
    const x = e.clientX;
    const y = e.clientY;

    if (isPressed) {
        writeCoord(x * dpr, (screenHeight - y) * dpr, true);
        writeTrail();
        isPressed = false;
    }
});

canvas.addEventListener('touchstart', (e) => {
    isPressed = true;

    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;

    writeCoord(x * dpr, (screenHeight - y) * dpr, true);
});
canvas.addEventListener('touchmove', (e) => {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;

    if (isPressed)
        writeCoord(x * dpr, (screenHeight - y) * dpr);
});
canvas.addEventListener('touchend', (e) => {
    if (isPressed) {
        writeTrail();
        isPressed = false;
    }
});
canvas.addEventListener('touchcancel', (e) => {
    if (isPressed) {
        writeTrail();
        isPressed = false;
    }
});

// utils

function compileShader(name, uniforms, attributes) {
	const vertexShaderCode = document.getElementById(name + '.vert').textContent;
	const fragmentShaderCode = document.getElementById(name + '.frag').textContent;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

    gl.shaderSource(vertexShader, vertexShaderCode);
    gl.shaderSource(fragmentShader, fragmentShaderCode);

    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        throw ('ERROR compiling vertex shader for ' + name + '!', gl.getShaderInfoLog(vertexShader));
    }

    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        throw ('ERROR compiling fragment shader for ' + name + '!', gl.getShaderInfoLog(fragmentShader));
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw ('ERROR linking program!', gl.getProgramInfoLog(program));
    }
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        throw ('ERROR validating program!', gl.getProgramInfoLog(program));
    }

    const instance = {
        program: program,

        use: function () {
            gl.useProgram(this.program);
        }
    };

    uniforms.forEach(function (uniform) {
        instance[uniform] = gl.getUniformLocation(program, uniform);
    });
	
    attributes.forEach(function (attribute) {
        instance[attribute] = gl.getAttribLocation(program, attribute);
    });

    return instance;
};

function allocQuad() {
	const vertices = Float32Array.from([
		-1, -1, 0,
		 1, -1, 0,
		-1,  1, 0,
		 1,  1, 0
	]);
	
	quadBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
	
	// vertex layout
	
    gl.vertexAttribPointer(program.vertexPosition, 3, 
		gl.FLOAT, false,
		3 * Float32Array.BYTES_PER_ELEMENT,
		0 * Float32Array.BYTES_PER_ELEMENT);
	gl.enableVertexAttribArray(program.vertexPosition);
}

function allocPointsBuffer() {
    const pixels = new Uint8Array(POINTS_MAP_RESOLUTION * POINTS_MAP_RESOLUTION * 4);
    pixels.fill(255);

    pointsBuffer = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, pointsBuffer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, POINTS_MAP_RESOLUTION, POINTS_MAP_RESOLUTION, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

let lastX, lastY;

function writeCoord(x, y, force) {
    if (lastX !== undefined && lastY !== undefined && !force) {
        const distance = Math.abs(lastX - x) + Math.abs(lastY - y);
        if (distance < 16 / SCALING) {
            return;
        }
    }

    if (pointsBufferPosition >= POINTS_MAP_RESOLUTION * POINTS_MAP_RESOLUTION - 2) {
        return false;
    }

    x = ((x | 0) % 65536);
    y = ((y | 0) % 65536);
    const pixel = Uint8Array.from([x % 256, (x / 256) | 0, y % 256, (y / 256) | 0]);

    const dstX = (pointsBufferPosition % POINTS_MAP_RESOLUTION);
    const dstY = (pointsBufferPosition / POINTS_MAP_RESOLUTION) | 0;

	gl.texSubImage2D(gl.TEXTURE_2D, 0, dstX, dstY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        
    pointsBufferPosition++;

    lastX = x;
    lastY = y;

    console.log(`${x} ${y} has been written to points texture`);

    return true;
}

function writeTrail() {
    writeCoord(65535, 65535, true);
}

function resize() {
	const width = document.body.clientWidth;
	const height = document.body.clientHeight;
	
	dpr = (1 / window.devicePixelRatio) / SCALING;
	
	screenWidth = width;
	screenHeight = height;
	
	canvas.width = screenWidth * dpr;
	canvas.height = screenHeight * dpr;
	
	canvas.style.width = screenWidth + "px";
	canvas.style.height = screenHeight + "px";
	
	gl.viewport(0.0, 0.0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);