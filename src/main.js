import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import GUI from 'lil-gui'

const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
})
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// Game
class Block {
    constructor(position, instanceId, grid) {
        this.baseColor = 0xffffff
        this.mine = false
        this.flagged = false
        this.position = position
        this.instanceId = instanceId
        this.grid = grid
        
        // Block scale change on reveal
        this.animState = { state: 0, scale: 0.9, desiredScale: 0 }
        
        this.revealed = false
        this.neighbors = 0
    }

    setMine() {
        this.mine = true
    }

    flag() {
        if (this.revealed) {
            return
        }

        this.flagged = !this.flagged

        // Update color on flag
        this.grid.mesh.setColorAt(this.instanceId, this.flagged ? new THREE.Color(0xffff00) : new THREE.Color(this.baseColor))
        this.grid.mesh.instanceColor.needsUpdate = true
    }
}

class Grid {
    colors = [0x0000ff, 0x00ff00, 0xff0000, 0x08064f, 0x4f3206, 0x148ccc, 0x555859]

    lost = false
    dummyMatrix = new THREE.Matrix4()

    constructor(scene) {
        this.scene = scene
        this.minesGenerated = false

        // Grid size
        this.size = {x: 7, y: 7, z: 7}

        // Default mine count for 7x7x7 (10% of blocks)
        this.mines = 34
        this.blocks = new Array(this.size.x)
        this.center = new THREE.Vector3()
    }

    generate() {
        if (this.mesh) {
            scene.remove(this.mesh)
        }

        const count = this.size.x * this.size.y * this.size.z
        this.minesGenerated = false
        this.lost = false
        this.center = new THREE.Vector3()
        this.blocks = new Array(this.size.x)
        this.geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9)
        this.material = new THREE.MeshBasicMaterial({ color: 0xffffff })
        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count)
        scene.add(this.mesh)
        
        // Create all blocks
        const dummy = new THREE.Object3D();
        for (let x = 0; x < this.size.x; x++) {
            this.blocks[x] = new Array(this.size.y)
            for (let y = 0; y < this.size.y; y++) {
                this.blocks[x][y] = new Array(this.size.z)
                for (let z = 0; z < this.size.z; z++) {
                    const i = (z * this.size.x * this.size.y) + (y * this.size.x) + x

                    dummy.position.set(x, y, z)
                    dummy.updateMatrix();
                    this.mesh.setMatrixAt(i, dummy.matrix);

                    this.blocks[x][y][z] = new Block(new THREE.Vector3(x, y, z), i, this)

                    if ((x % 2) == (z % 2) == (y % 2)) {
                        this.blocks[x][y][z].baseColor = 0xBDBDBD;
                        this.mesh.setColorAt(i, new THREE.Color(0xBDBDBD))
                    }
                    else {
                        this.blocks[x][y][z].baseColor = 0x7B7B7B;
                        this.mesh.setColorAt(i, new THREE.Color(0x7B7B7B))
                    }

                    // Used to reposition camera to focus on center of grid
                    this.center.add(new THREE.Vector3(x, y, z))
                }
            }
        }

        this.center.divideScalar(count)
        // Reposition camera
        controls.target = this.center
    }

    // Randomly place all mines
    setMines(clickedPos) {
        let mines = this.mines
        while (mines > 0) {
            const x = Math.floor(Math.random() * this.size.x)
            const y = Math.floor(Math.random() * this.size.y)
            const z = Math.floor(Math.random() * this.size.z)

            const minePos = new THREE.Vector3(x, y, z)
            // Don't make the clicked position a mine
            if (clickedPos.distanceToSquared(minePos) >= 4) {
                const block = this.blocks[x][y][z]
                if (!block.mine) {
                    block.setMine()
                    mines--
                }
            }
        }

        this.minesGenerated = true
    }

    flagMine(clickedPos) {
        this.blocks[clickedPos.x][clickedPos.y][clickedPos.z].flag()
    }

    // Check if within given size constraint
    inBounds(position) {
        if (position.x >= 0 && position.x < this.size.x) {
            if (position.y >= 0 && position.y < this.size.y) {
                if (position.z >= 0 && position.z < this.size.z) {
                    return true
                }
            }
        }

        return false
    }

    clearBlocks(position, isClick = false) {
        if (!this.inBounds(position)) return

        const block = this.blocks[position.x][position.y][position.z]

        if (block.revealed || block.flagged) return
        this.reveal(position, isClick)
        if (block.mine) return

        if (block.neighbors === 0) {
            this.clearBlocks(new THREE.Vector3(position.x - 1, position.y, position.z))
            this.clearBlocks(new THREE.Vector3(position.x - 1, position.y + 1, position.z))
            this.clearBlocks(new THREE.Vector3(position.x - 1, position.y - 1, position.z))

            this.clearBlocks(new THREE.Vector3(position.x + 1, position.y, position.z))
            this.clearBlocks(new THREE.Vector3(position.x + 1, position.y + 1, position.z))
            this.clearBlocks(new THREE.Vector3(position.x + 1, position.y - 1, position.z))
            
            this.clearBlocks(new THREE.Vector3(position.x, position.y - 1, position.z))
            this.clearBlocks(new THREE.Vector3(position.x, position.y - 1, position.z + 1))
            this.clearBlocks(new THREE.Vector3(position.x, position.y - 1, position.z - 1))

            this.clearBlocks(new THREE.Vector3(position.x, position.y + 1, position.z))
            this.clearBlocks(new THREE.Vector3(position.x, position.y + 1, position.z + 1))
            this.clearBlocks(new THREE.Vector3(position.x, position.y + 1, position.z - 1))

            this.clearBlocks(new THREE.Vector3(position.x, position.y, position.z - 1))
            this.clearBlocks(new THREE.Vector3(position.x, position.y, position.z + 1))
        }
    }

    reveal(position, isClick) {
        const block = this.blocks[position.x][position.y][position.z]

        if (block.flagged) return

        block.neighbors = this.getNeighbors(position)
        
        if (block.mine) {
            if (isClick) {
                block.baseColor = 0xFF0000
                this.mesh.setColorAt(block.instanceId, new THREE.Color(0xFF0000))
                this.mesh.instanceColor.needsUpdate = true
                alert("You lose!")
                this.lost = true
            }
        }
        else if (block.neighbors > 0) {
            // sprite textures
            block.revealed = true
            const color = new THREE.Color(this.baseColor)
            block.animState.state = 1
            block.animState.desiredScale = 0.25

            color.set(this.colors[block.neighbors - 1])

            this.mesh.setColorAt(block.instanceId, color)
            this.mesh.instanceColor.needsUpdate = true
        }
        else {
            // remove cube
            block.revealed = true
            block.animState.state = 1
            block.animState.desiredScale = 0
        }
    }

    checkWin() {
        for (let x = 0; x < this.blocks.length; x++) {
            for (let y = 0; y < this.blocks[x].length; y++) {
                for (let z = 0; z < this.blocks[x][y].length; z++) {
                    const block = this.blocks[x][y][z]

                    if (block.mine) {
                        continue
                    }
                    else if (block.revealed) {
                        continue
                    }
                    else {
                        return false
                    }
                }
            }
        }

        return true
    }

    getNeighbors(position) {
        let neighbors = 0

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    if (i === 0 && j === 0 && k == 0) continue
                    let pos = new THREE.Vector3(position.x + i, position.y + j, position.z + k)
                    if (!this.inBounds(pos)) continue

                    if (this.blocks[position.x + i][position.y + j][position.z + k].mine) {
                        neighbors += 1
                    }
                }
            }
        }

        return neighbors
    }

    animateBlocks(deltaTime) {
        let needsUpdate = false

        if (this.lost) return

        for (let x = 0; x < this.blocks.length; x++) {
            for (let y = 0; y < this.blocks[x].length; y++) {
                for (let z = 0; z < this.blocks[x][y].length; z++) {
                    const block = this.blocks[x][y][z]

                    if (block.animState.state != 0) {
                        let scale = 0
                        const i = (z * this.size.x * this.size.y) + (y * this.size.x) + x

                        if (block.animState.state === 1) {
                            scale = Math.max(block.animState.desiredScale, block.animState.scale - deltaTime * 200)
                            block.animState.scale = scale
                        }

                        if (scale == block.animState.desiredScale) {
                            block.animState.state = 0
                        }

                        this.dummyMatrix.compose(block.position, new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale))
                        this.mesh.setMatrixAt(i, this.dummyMatrix);
                    }
                    
                    needsUpdate = true
                }
            }
        }

        this.mesh.instanceMatrix.needsUpdate = needsUpdate
    }
}

// Grid
const grid = new Grid(scene)

// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(-grid.size.x, grid.size.y, grid.size.z)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

window.addEventListener('mousemove', (event) => {
    const x = (event.clientX / sizes.width) * 2 - 1
    const y = - ((event.clientY / sizes.height) * 2 - 1)
    mouse.set(x, y)
})

window.addEventListener('mouseup', (event) => {
    if (grid.lost) return

    raycaster.setFromCamera(mouse, camera)
    const intersection = raycaster.intersectObject(grid.mesh, false)

    const matrix = new THREE.Matrix4()
    for (let i = 0; i < intersection.length; i++) {
        const pos = new THREE.Vector3()
        const instanceId = intersection[i].instanceId
        grid.mesh.getMatrixAt(instanceId, matrix)
        pos.setFromMatrixPosition(matrix)

        const block = grid.blocks[pos.x][pos.y][pos.z]

        if (block.revealed) {
            continue
        }

        if (event.button == 0) { // left click
            if (!grid.minesGenerated) {
                grid.setMines(pos)
            }

            grid.clearBlocks(pos, true)

            if (grid.checkWin()) {
                alert("You won!")
            }
        }
        else if (event.button == 2) { // right click 
            if (grid.minesGenerated) {
                grid.flagMine(pos)
            }
        }

        break
    }
})

grid.generate()

// GUI
const gui = new GUI()

gui.add(grid.size, 'x', 1, 25).step(1).onFinishChange(updateGUI)
gui.add(grid.size, 'y', 1, 25).step(1).onFinishChange(updateGUI)
gui.add(grid.size, 'z', 1, 25).step(1).onFinishChange(updateGUI)
const mineController = gui.add(grid, 'mines', 1, Math.floor(grid.size.x * grid.size.y * grid.size.z * 0.5)).name('Mines').step(1).onFinishChange(() => {
    grid.generate()
})
gui.add(grid, 'generate').name('Regenerate')

function updateGUI() {
    mineController.max(Math.floor(grid.size.x * grid.size.y * grid.size.z * 0.5)).updateDisplay()
    mineController.setValue(Math.floor(grid.size.x * grid.size.y * grid.size.z * 0.1))
    grid.generate()
}


// Render Loop
const clock = new THREE.Clock()

let lastIntersection
const dummyMatrix = new THREE.Matrix4()
const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()

    // Update controls
    controls.update()

    raycaster.setFromCamera(mouse, camera)
    const intersection = raycaster.intersectObject(grid.mesh, false)
    let intersectionRevealed = false
    let intersectionFlagged = false

    if (intersection.length > 0) {
        lastIntersection = intersection[0]

        const pos = new THREE.Vector3()
        const instanceId = lastIntersection.instanceId
        grid.mesh.getMatrixAt(instanceId, dummyMatrix)
        pos.setFromMatrixPosition(dummyMatrix)
        const intersectedBlock =  grid.blocks[pos.x][pos.y][pos.z];
        intersectionRevealed = intersectedBlock.revealed
        intersectionFlagged = intersectedBlock.flagged
        
        if (!intersectionRevealed) {
            if (intersectionFlagged) {
                lastIntersection.object.setColorAt(instanceId, new THREE.Color(0x9E9E02))
            }
            else {
                lastIntersection.object.setColorAt(instanceId, new THREE.Color(0xA1A1A1))
            }
        }
    }
    
    // Render
    renderer.render(scene, camera)
    grid.animateBlocks(clock.getDelta())

    if (intersection.length > 0) {
        const pos = new THREE.Vector3()
        const instanceId = lastIntersection.instanceId
        grid.mesh.getMatrixAt(instanceId, dummyMatrix)
        pos.setFromMatrixPosition(dummyMatrix)
        const intersectedBlock =  grid.blocks[pos.x][pos.y][pos.z];

        if (!intersectionRevealed) {
            if (intersectionFlagged) {
                intersection[0].object.setColorAt(intersection[0].instanceId, new THREE.Color(0xffff00))
            }
            else {
                intersection[0].object.setColorAt(intersection[0].instanceId, new THREE.Color(intersectedBlock.baseColor))
            }
        }
    }
    else {
        if (intersectionRevealed) {
            lastIntersection.object.setColorAt(lastIntersection.instanceId, new THREE.Color(intersectedBlock.baseColor))
        }
    }

    grid.mesh.instanceColor.needsUpdate = true
    
    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()