class MinimalismDemo {
    constructor() {
        this.items = [];
        this.isActive = false;
        this.startTime = null;
        this.duration = 30;
        this.itemLimit = 100;
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.startButton = document.getElementById('startChallenge');
        this.statusElement = document.getElementById('status');
        this.timerElement = document.getElementById('timer');
        this.itemsList = document.getElementById('itemsList');
        this.newItemInput = document.getElementById('newItem');
        this.addItemButton = document.getElementById('addItem');
        this.durationInput = document.getElementById('duration');
        this.itemLimitInput = document.getElementById('itemLimit');
    }

    bindEvents() {
        this.startButton.addEventListener('click', () => this.toggleChallenge());
        this.addItemButton.addEventListener('click', () => this.addItem());
        this.newItemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addItem();
        });
    }

    toggleChallenge() {
        if (!this.isActive) {
            this.startChallenge();
        } else {
            this.endChallenge();
        }
    }

    startChallenge() {
        this.isActive = true;
        this.startTime = new Date();
        this.duration = parseInt(this.durationInput.value);
        this.itemLimit = parseInt(this.itemLimitInput.value);
        this.startButton.textContent = '结束挑战';
        this.statusElement.textContent = '挑战进行中';
        this.updateTimer();
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    }

    endChallenge() {
        this.isActive = false;
        this.startButton.textContent = '开始挑战';
        this.statusElement.textContent = '挑战已结束';
        clearInterval(this.timerInterval);
    }

    updateTimer() {
        if (!this.isActive) return;
        
        const now = new Date();
        const elapsed = Math.floor((now - this.startTime) / 1000);
        const remaining = this.duration * 24 * 60 * 60 - elapsed;
        
        if (remaining <= 0) {
            this.endChallenge();
            return;
        }

        const days = Math.floor(remaining / (24 * 60 * 60));
        const hours = Math.floor((remaining % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((remaining % (60 * 60)) / 60);
        const seconds = remaining % 60;

        this.timerElement.textContent = 
            `剩余时间: ${days}天 ${hours}时 ${minutes}分 ${seconds}秒`;
    }

    addItem() {
        const itemName = this.newItemInput.value.trim();
        if (!itemName) return;

        if (this.items.length >= this.itemLimit) {
            alert(`已达到物品数量限制 (${this.itemLimit})`);
            return;
        }

        this.items.push(itemName);
        this.newItemInput.value = '';
        this.renderItems();
    }

    removeItem(index) {
        this.items.splice(index, 1);
        this.renderItems();
    }

    renderItems() {
        this.itemsList.innerHTML = '';
        this.items.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${item}</span>
                <button onclick="demo.removeItem(${index})">删除</button>
            `;
            this.itemsList.appendChild(li);
        });
    }
}

const demo = new MinimalismDemo();