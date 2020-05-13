import {GamepadInterface, GamepadButtons} from '../gamepad';
import {Uint8, Numbers} from '../numbers';

const KEYBOARD_CONTROLS = new Map<number, number>([
    [65, GamepadButtons.A],
    [83, GamepadButtons.B],
    [90, GamepadButtons.SELECT],
    [88, GamepadButtons.START],
    [38, GamepadButtons.UP],
    [40, GamepadButtons.DOWN],
    [37, GamepadButtons.LEFT],
    [39, GamepadButtons.RIGHT]
]);

const enum GamepadDataSource {
    BUTTON = 'button',
    AXIS = 'axis'
}

const GAMEPAD_CONTROLS = new Map<GamepadButtons, [GamepadDataSource, number, number]>([
    [GamepadButtons.A, [GamepadDataSource.BUTTON, 1, 1]],
    [GamepadButtons.B, [GamepadDataSource.BUTTON, 2, 1]],
    [GamepadButtons.SELECT, [GamepadDataSource.BUTTON, 8, 1]],
    [GamepadButtons.START, [GamepadDataSource.BUTTON, 9, 1]],
    [GamepadButtons.UP, [GamepadDataSource.AXIS, 1, -1]],
    [GamepadButtons.DOWN, [GamepadDataSource.AXIS, 1, 1]],
    [GamepadButtons.LEFT, [GamepadDataSource.AXIS, 0, -1]],
    [GamepadButtons.RIGHT, [GamepadDataSource.AXIS, 0, 1]]
]);

function prevent(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
}

function getButtonMapString(button: GamepadButtons, value: string): string {
    switch(button) {
        case GamepadButtons.A:
            return `A - ${value}`;

        case GamepadButtons.B:
            return `B - ${value}`;

        case GamepadButtons.SELECT:
            return `Select - ${value}`;

        case GamepadButtons.START:
            return `Start - ${value}`;

        case GamepadButtons.UP:
            return `Up - ${value}`;

        case GamepadButtons.DOWN:
            return `Down - ${value}`;

        case GamepadButtons.LEFT:
            return `Left - ${value}`;

        case GamepadButtons.RIGHT:
            return `Right - ${value}`;

        default:
            throw new Error(`Unknown gamepad button ${button}`);
    }
}

export class GamepadSettingsView {
    private keyboardButtons: Uint8 = 0;
    constructor(
        private readonly container: HTMLElement
    ) {
        document.addEventListener('keydown', (e) => {
            const button = KEYBOARD_CONTROLS.get(e.which);
            if (button === undefined) {
                return;
            }

            prevent(e);
            this.keyboardButtons |= button;
        });

        document.addEventListener('keyup', (e) => {
            const button = KEYBOARD_CONTROLS.get(e.which);
            if (button === undefined) {
                return;
            }

            prevent(e);
            this.keyboardButtons = (this.keyboardButtons & ~button) & Numbers.UINT8_CAST;
        });

        window.addEventListener('gamepadconnected', this.render);
        window.addEventListener('gamepaddisconnected', this.render);

        this.render();
        this.renderKeyboardControls();
        this.renderGamepadControls();
    }

    private render = (): void => {
        if (this.getGamepad() === null) {
            this.container.classList.remove('-gamepad');
        } else {
            this.container.classList.add('-gamepad');
        }
    }

    private renderKeyboardControls(): void {
        const listContainer = this.container.querySelector('.gamepad-settings__no-gamepad ul');

        if (!listContainer) {
            throw new Error('Missing listContainer');
        }

        for (const [keyCode, button] of KEYBOARD_CONTROLS.entries()) {
            const li = document.createElement('li');
            listContainer.appendChild(li);
            let character = String.fromCharCode(keyCode);
            switch (keyCode) {
                case 38:
                    character = 'up arrow';
                    break;

                case 40:
                    character = 'down arrow';
                    break;

                case 37:
                    character = 'left arrow';
                    break;

                case 39:
                    character = 'right arrow';
                    break;
            }

            li.innerText = getButtonMapString(button, character);
        }
    }

    private renderGamepadControls(): void {
        const listContainer = this.container.querySelector('.gamepad-settings__gamepad ul');

        if (!listContainer) {
            throw new Error('Missing listContainer');
        }

        for (const [button, [source, index, value]] of GAMEPAD_CONTROLS.entries()) {
            const li = document.createElement('li');
            listContainer.appendChild(li);
            li.innerText = getButtonMapString(
                button,
                `${source} ${index + 1} ${source === GamepadDataSource.BUTTON ? '' : value}`
            );
        }
    }

    getGamepadInterface(): GamepadInterface {
        return this.gamepadInterface;
    }

    private getGamepad(): Gamepad | null {
        const gamepads = navigator.getGamepads();

        if (gamepads === null || gamepads.length === 0 || gamepads[0] === null) {
            return null;
        } else {
            return gamepads[0];
        }
    }

    private gamepadInterface = (): Uint8 => {
        const gamepad = this.getGamepad();

        if (!gamepad) {
            return this.keyboardButtons;
        }

        let gamepadButtons = 0;

        for (const [button, [source, index, value]] of GAMEPAD_CONTROLS.entries()) {
            if (source === GamepadDataSource.BUTTON) {
                if (gamepad.buttons[index].pressed) {
                    gamepadButtons |= button;
                }
            } else if (gamepad.axes[index] === value)  {
                gamepadButtons |= button;
            }
        }

        return gamepadButtons;
    }
}
