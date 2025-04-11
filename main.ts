import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, ItemView, WorkspaceLeaf } from 'obsidian';
// 定义物品分类
const ITEM_CATEGORIES: {
    [key: string]: { color: string; icon: string; order: number };
} = {
	"衣物": {color: "#B4846C", icon: "🧣", order: 1},
	"日用品": {color: "#A7B89D", icon: "🧴", order: 2},
	"食物": {color: "#E1A692", icon: "🍕", order: 3},
	"电子产品": {color: "#7895B2", icon: "📱", order: 4},
	"文具": {color: "#BBAB8C", icon: "✏️", order: 5},
	"书籍": {color: "#E5BA73", icon: "📖", order: 6},
	"装饰品": {color: "#C17C74", icon: "🎀", order: 7},
	"其它": {color: "#939B9F", icon: "🫙", order: 8},
	"default": {color: "#e8e8e8", icon: "📎", order: 9}
};

// 定义处理方式
const DISPOSAL_METHODS: {
    [key: number]: { label: string; icon: string };
} = {
	0: { label: "立即处理", icon: "🗑️"},
	20: { label: "推荐舍弃", icon: "📤"},
	40: { label: "灵活处理", icon: "🔄"},
	60: { label: "建议保留", icon: "📥"},
	80: { label: "必须保留", icon: "📦"}
};

interface MinimalismChallengeSettings {
	challengeYear: number;  // 添加年份设置
	challengeMonth: number;
	lifeStage: number;
	dataFilePath: string;
	markdownTable: string;
	scoreWeights: {
		freq: number;
		necessity: number;
		irreplace: number;
		space: number;
		multifunction: number;
		emotion: number;
		maintenance: number;
		cost: number;
		[key: string]: number; // 添加索引签名
	};
}

const DEFAULT_SETTINGS: MinimalismChallengeSettings = {
	challengeYear: new Date().getFullYear(),  // 默认为当前年份
	challengeMonth: new Date().getMonth() ,
	lifeStage: 1,
	dataFilePath: 'minimalism_items_template.md',
	markdownTable: '', // 默认为空
	scoreWeights: { // 默认权重均为1
		freq: 0.8,       // 使用频率权重较高
		necessity: 0.9,   // 必要性权重最高
		irreplace: 0.7,   // 不可替代性中等偏上
		space: 0.6,       // 空间负担中等
		multifunction: 0.5, // 多功能性中等
		emotion: 0.4,     // 情感价值中等偏下
		maintenance: 0.3, // 维护费用较低
		cost: 0.2       // 获取成本最低
	}
}

// 定义视图类型
const MINIMALISM_VIEW_TYPE = 'minimalism-challenge-view';

export default class MinimalismChallengePlugin extends Plugin {
	settings: MinimalismChallengeSettings;
	private activateView() {
        let leaf = this.app.workspace.getLeavesOfType(MINIMALISM_VIEW_TYPE)[0];

        if (!leaf) {
            const rightLeaf = this.app.workspace.getRightLeaf(false);
            if (!rightLeaf) {
                throw new Error('无法创建新的工作区叶子');
            }
            leaf = rightLeaf;
            leaf.setViewState({
                type: MINIMALISM_VIEW_TYPE,
                active: true,
            });
        } else {
            this.app.workspace.revealLeaf(leaf);
        }
    }

	async onload() {
		await this.loadSettings();
		// 检查并更新特定设置
		let needsUpdate = false;
    
		// 检查 cost 值是否需要更新
		if (this.settings.scoreWeights.cost !== 0.2) {
			this.settings.scoreWeights.cost = 0.2;
			needsUpdate = true;
		}
		
		// 如果有设置需要更新，保存设置
		if (needsUpdate) {
			await this.saveSettings();
			console.log('已更新设置值到最新默认值');
		}
        this.addStyles();

		// 检查数据文件是否存在，如果不存在则创建默认数据文件
		try {
			await this.ensureDataFileExists();
		} catch (error) {
			console.error('初始化数据文件失败:', error);
			// 不显示错误通知，避免每次加载都提示
		}

        // 注册视图类型
        this.registerView(
            MINIMALISM_VIEW_TYPE,
            (leaf) => new MinimalismChallengeView(leaf, this)
        );

        // 添加功能区图标
        const ribbonIconEl = this.addRibbonIcon('calendar-with-checkmark', '极简主义挑战日历', () => {
            this.activateView();
        });
        ribbonIconEl.addClass('minimalism-challenge-ribbon-class');

        // 添加命令
        this.addCommand({
            id: 'open-minimalism-calendar',
            name: '打开极简主义挑战日历',
            callback: () => {
                this.activateView();
            }
        });
        
        // 添加创建数据文件模板的命令
        this.addCommand({
            id: 'create-minimalism-data-template',
            name: '创建极简主义挑战数据模板',
            callback: async () => {
                await this.createDataFileTemplate();
            }
        });

        // 添加设置选项卡
        this.addSettingTab(new MinimalismChallengeSettingTab(this.app, this));
    }
	// 添加重置设置方法
	async resetSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS);
		await this.saveSettings();
		new Notice('设置已重置为默认值');
	}
	// 添加一个新方法来检查并确保数据文件存在
	async ensureDataFileExists() {
		try {
			const filePath = this.settings.dataFilePath;
			// 检查路径是否有效
			if (!filePath || filePath.trim() === '') {
				console.log('文件路径为空，使用默认路径');
				this.settings.dataFilePath = DEFAULT_SETTINGS.dataFilePath;
				await this.saveData(this.settings);
			}
			
			const file = this.app.vault.getAbstractFileByPath(this.settings.dataFilePath);
			
			// 如果文件不存在，则创建默认数据文件
			if (!file) {
				console.log('数据文件不存在，创建默认数据文件');
				try {
					await this.createDataFileTemplate();
					console.log('成功创建默认数据文件');
				} catch (error) {
					// 如果创建失败但错误是"文件已存在"，尝试直接加载该文件
					if (error.message && error.message.includes('already exists')) {
						console.log('文件已存在，尝试直接加载');
						await this.loadItemsData();
					} else {
						throw error;
					}
				}
			} else {
				console.log('数据文件已存在:', this.settings.dataFilePath);
				// 文件存在，直接加载
				await this.loadItemsData();
			}
		} catch (error) {
			console.error('检查数据文件时出错:', error);
			// 不要在这里显示错误通知，避免每次加载都提示
		}
	}


	private addStyles() {
		const styleEl = document.head.querySelector('style#minimalism-challenge-styles');
		if (styleEl) styleEl.remove();
		
		const style = document.createElement('style');
    style.id = 'minimalism-challenge-styles';
    style.type = 'text/css';
    style.textContent = `
        .minimalism-challenge-view {
            padding: clamp(10px, 2vw, 20px);
            overflow-y: auto;
            width: 100% !important;
            height: 100%;
            max-width: 1000px !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
        }
        
        .workspace-leaf-content[data-type="${MINIMALISM_VIEW_TYPE}"] {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            width: 100% !important;
        }
        
        .workspace-leaf-content[data-type="${MINIMALISM_VIEW_TYPE}"] .view-content {
            width: 100% !important; /* 改为自动宽度 */
            max-width: 1000px !important;
        }
        .minimalism-calendar-container {
            background: linear-gradient(135deg, #f5f5f5 0%, #fafafa 100%);
            border-radius: 18px;
            padding: clamp(20px, 3vw, 40px);
            margin: clamp(10px, 2vw, 20px) 0;
            box-shadow: 0 6px 15px rgba(0,0,0,0.05);
            overflow-y: auto;
            width: 100% !important;
            height: 100%;
            max-width: 1000px !important;  /* 最大宽度限制 */
            margin: 0 auto !important;     /* 居中显示 */
            box-sizing: border-box !important;
        }
			/* 确保内部元素不会超出容器 */
			.minimalism-calendar-container > * {
				max-width: 100% !important;
			}
			.minimalism-title {
            text-align: center;
            color: #A67F5D;
            font-family: 'Futura', 'Trebuchet MS', -apple-system;
            font-weight: 700;
            font-size: clamp(36px, 5vw, 60px);
            margin: 20px 0 15px;
            opacity: 0.85;
            letter-spacing: -1.5px;
        }

        .minimalism-subtitle {
            text-align: center;
            color: #BEA98B;
            font-family: 'Helvetica Neue', 'Arial', -apple-system;
            font-weight: 500;
            font-size: clamp(20px, 3vw, 30px);
            margin: 0 0 30px;
            opacity: 0.75;
            letter-spacing: 0.2px;
        }

        .stats-panel {
            display: flex;
            flex-direction: column;
            gap: clamp(10px, 2vw, 15px);
            margin: clamp(15px, 3vw, 20px) 0;
            padding: clamp(15px, 2vw, 20px);
        }

        @media (max-width: 768px) {
            .minimalism-calendar-container {
                padding: clamp(15px, 2vw, 25px);
            }
            
            .stats-grid {
                grid-template-columns: 1fr !important;
            }
            
            .category-grid {
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)) !important;
            }
        }

        @media (max-width: 480px) {
            .minimalism-title {
                font-size: clamp(28px, 4vw, 36px);
            }
            
            .minimalism-subtitle {
                font-size: clamp(16px, 2.5vw, 20px);
            }
        }
		`;
		document.head.appendChild(style);
	}
	
	onunload() {
        // 清理视图
        this.app.workspace.detachLeavesOfType(MINIMALISM_VIEW_TYPE);
		// 清理样式
		const styleEl = document.head.querySelector('style#minimalism-challenge-styles');
		if (styleEl) styleEl.remove();
	}

	// 添加加载设置方法
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	
	// 修改 createDataFileTemplate 方法
	async createDataFileTemplate() {
		const filePath = this.settings.dataFilePath;
		// 检查路径是否有效
		if (!filePath || filePath.trim() === '') {
			throw new Error('文件路径不能为空');
		}
		
		// 先检查文件是否已存在
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file && file instanceof TFile) {
			console.log(`文件已存在: ${filePath}，跳过创建`);
			// 文件已存在，直接返回，不抛出错误
			return;
		}
		
		// 获取当前设置的年份和月份
		const year = this.settings.challengeYear;
		const month = String(this.settings.challengeMonth).padStart(2, '0');
		
		// 创建表头
		const headers = ['日期', '物品', '记忆', '告别语', '分类', '使用频率', '必要性', '不可替代性', '空间负担', '多功能性', '情感价值', '维护费用', '获取成本'];
		
		// 创建示例数据行
		const templateRows = [
			`| ${year}-${month}-01 | 旧T恤 | 大学时期购买的T恤，已经有些褪色和磨损，但曾是我最喜欢的一件衣服。 | 陪伴了我的青春岁月，感谢你的服务 | 衣物 | 20 | 30 | 40 | 60 | 50 | 75 | 10 | 40 |`,
			`| ${year}-${month}-02 | 旧手机充电器 | 随着手机更新换代，这个充电器已经不太适用，但一直舍不得扔掉。 | 曾经的能量供应者，现在可以休息了 | 电子产品 | 10 | 15 | 5 | 70 | 10 | 5 | 0 | 30 |`,
			`| ${year}-${month}-03 | 未读完的书 | 购买后只读了几页就搁置的书，一直想找时间读完但始终没有行动。 | 愿你在新主人手中被完整阅读 | 书籍 | 5 | 20 | 30 | 60 | 40 | 25 | 0 | 50 |`,
			`| ${year}-${month}-04 | 装饰花瓶 | 搬家时购买的装饰品，但与新家的风格不太搭配，一直放在角落里。 | 愿你在新家中绽放光彩 | 装饰品 | 0 | 10 | 20 | 50 | 30 | 15 | 20 | 60 |`,
			`| ${year}-${month}-05 | 过期护肤品 | 曾经热衷尝试的护肤产品，使用几次后就被遗忘在抽屉里。 | 谢谢你让我认识到简单护肤的重要 | 日用品 | 5 | 10 | 5 | 80 | 10 | 0 | 10 | 70 |`
		];
		
		// 组合成完整的Markdown表格
		const markdownTable = [
			`| ${headers.join(' | ')} |`,
			`| ${headers.map(() => '---').join(' | ')} |`,
			...templateRows
		].join('\n');
		
		// 创建模板内容
		const templateContent = 
	`---
	created: ${new Date().toISOString().split('T')[0]}
	updated: ${new Date().toISOString().split('T')[0]}
	---

	# 极简主义挑战物品数据

	以下是极简主义挑战的物品记录表格。您可以直接在此文件中编辑表格内容，插件会自动读取并显示。

	${markdownTable}

	## 表格说明
	- 日期格式：YYYY-MM-DD
	- 分类可选值：衣物、电子产品、书籍、文具、厨具、日用品、装饰品、其它
	- 各评分项目范围：0-100，数值越高表示该项评分越高
	`;

		try {
			// 再次检查文件是否存在（以防在此期间被创建）
			const fileCheck = this.app.vault.getAbstractFileByPath(filePath);
			if (fileCheck && fileCheck instanceof TFile) {
				console.log(`文件已存在: ${filePath}，跳过创建`);
				return;
			}
			
			// 创建文件
			await this.app.vault.create(filePath, templateContent);
			console.log(`已创建数据模板: ${filePath}`);
			
			// 更新设置中的markdownTable
			this.settings.markdownTable = templateContent;
			await this.saveData(this.settings);
		} catch (error) {
			// 如果错误是"文件已存在"，不要抛出错误，而是尝试加载现有文件
			if (error.message && error.message.includes('already exists')) {
				console.log('文件已存在，尝试加载现有文件');
				try {
					// 尝试加载现有文件
					const file = this.app.vault.getAbstractFileByPath(this.settings.dataFilePath);
					if (file && file instanceof TFile) {
						const content = await this.app.vault.read(file);
						this.settings.markdownTable = content;
						await this.saveData(this.settings);
						console.log('成功加载现有文件');
					}
					return; // 不抛出错误
				} catch (loadError) {
					console.error('加载现有文件失败:', loadError);
					// 即使加载失败也不抛出错误
					return;
				}
			}
			 // 记录错误但不抛出，避免中断插件加载
			 console.error('创建数据模板失败:', error);
			}
	}
	

	convertMarkdownToJson(markdownTable: string): any[] {
        if (!markdownTable.trim()) {
            throw new Error('Markdown表格为空');
        }
        
        const lines = markdownTable.trim().split('\n');
        if (lines.length < 3) {
            throw new Error('无效的Markdown表格格式');
        }
        
        const headers = lines[0].split('|')
            .map(h => h.trim())
            .filter(h => h.length > 0);
        
        const dataLines = lines.slice(2);
        
        return dataLines.map(line => {
            const values = line.split('|')
                .map(v => v.trim())
                .filter(v => v.length > 0);
            
            if (values.length !== headers.length) {
                throw new Error(`行数据与表头不匹配: ${line}`);
            }
            
            const rowData: {[key: string]: any} = {};
            headers.forEach((header, index) => {
                rowData[header] = values[index];
            });
            
            return rowData;
        });
    }

    // 添加 saveMarkdownAsJson 方法
    async saveMarkdownAsJson(): Promise<void> {
        try {
            const jsonData = this.convertMarkdownToJson(this.settings.markdownTable);
            const filePath = this.settings.dataFilePath;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            
            const jsonContent = JSON.stringify(jsonData, null, 2);
            const fileContent = `---
created: ${new Date().toISOString().split('T')[0]}
updated: ${new Date().toISOString().split('T')[0]}
---

# 极简主义挑战物品数据

\`\`\`json
${jsonContent}
\`\`\`
`;
            
            if (file && file instanceof TFile) {
                await this.app.vault.modify(file, fileContent);
            } else {
                await this.app.vault.create(filePath, fileContent);
            }
        } catch (error) {
            throw error;
        }
    }	
	// 添加更新视图的方法
    async refreshView() {
        const leaves = this.app.workspace.getLeavesOfType(MINIMALISM_VIEW_TYPE);
        for (const leaf of leaves) {
            if (leaf.view instanceof MinimalismChallengeView) {
                await leaf.view.onOpen();
            }
        }
    }

    // 修改 saveSettings 方法
    async saveSettings() {
        // 保存旧的文件路径，用于比较
		const oldFilePath = this.settings.dataFilePath;
		
		await this.saveData(this.settings);
		
		// 检查文件路径是否变化
		if (oldFilePath !== this.settings.dataFilePath) {
			// 如果文件路径变化，重新加载数据
			await this.loadItemsData();
		}
		
		await this.refreshView(); // 保存设置后刷新视图
	}
	// 添加加载数据的方法
	async loadItemsData() {
		try {
			const filePath = this.settings.dataFilePath;
			const file = this.app.vault.getAbstractFileByPath(filePath);
			
			if (file && file instanceof TFile) {
				const content = await this.app.vault.read(file);
				// 解析 Markdown 表格
				this.settings.markdownTable = content;
				// 保存设置但不触发 saveSettings 的递归调用
				await this.saveData(this.settings);
				console.log(`数据已从 ${filePath} 加载`); // 改为console.log而不是Notice
			} else {
				console.log(`找不到数据文件: ${filePath}`); // 改为console.log而不是Notice
			}
		} catch (error) {
			console.error('加载数据失败:', error);
			// 不显示错误通知，避免每次加载都提示
		}
	}

}

// 创建日历视图（改为ItemView而不是Modal）
class MinimalismChallengeView extends ItemView {
	plugin: MinimalismChallengePlugin;

	constructor(leaf: WorkspaceLeaf, plugin: MinimalismChallengePlugin) {
		super(leaf);
		this.plugin = plugin;
	}
	
	// 获取视图类型
	getViewType(): string {
		return MINIMALISM_VIEW_TYPE;
	}
	
	// 获取视图显示名称
	getDisplayText(): string {
		return '极简主义挑战日历';
	}
	
	// 获取视图图标
	getIcon(): string {
		return 'calendar-with-checkmark';
	}
	
	// 当视图被打开时
	async onOpen() {
		const contentEl = this.contentEl;
		contentEl.empty();
		contentEl.addClass('minimalism-challenge-view');
		
		// 渲染日历视图
		await this.renderCalendarView(contentEl);
	}
	
	async renderCalendarView(containerEl: HTMLElement) {
		// 创建主容器
	const mainContainer = document.createElement('div');
	mainContainer.className = 'minimalism-calendar-container';
	
	// 添加标题，包含年月信息
	const year = this.plugin.settings.challengeYear;
	const month = this.plugin.settings.challengeMonth;
	
	mainContainer.innerHTML = `
		<div class="minimalism-title" style="
			text-align: center; 
			color: #A67F5D;
			font-family: 'Futura', 'Trebuchet MS', -apple-system;
			font-weight: 700;
			font-size: 80px;
			margin: 20px 0 15px;
			opacity: 0.85;
			letter-spacing: -1.5px;
			position: relative;
		">
			<span style="
				font-size: 15px;
				position: absolute;
				top: 8px;
				right: 30px;
				font-weight: 400;
				opacity: 0.8;
				background: rgba(166, 127, 93, 0.15);
				padding: 2px 10px;
				border-radius: 20px;
				backdrop-filter: blur(2px);
				background-color: rgba(190, 169, 139, 0.1);
				border: 1.5px solid rgba(166, 127, 93, 0.8);
				color: rgba(166, 127, 93, 0.8);
			">${year} ${String(month).padStart(2, '0')}</span>
			30 Days
		</div>
		<div class="minimalism-subtitle" style="
			text-align: center;
			color: #BEA98B;
			font-family: 'Helvetica Neue', 'Arial', -apple-system;
			font-weight: 500;
			font-size: 40px;
			margin: 0 0 30px;
			opacity: 0.75;
			letter-spacing: 0.2px;
		">Minimalism Game</div>
		<div style="
			text-align: center;
			color: #BEA98B;
			font-family: 'Georgia', 'Times New Roman', serif;
			font-weight: 400;
			font-size: 20px;
			font-style: italic;
			margin: 0 0 15px;
			opacity: 0.7;
		">“ Less is more ”</div>

	`;
		
		try {
			// 加载数据
			const data = await this.loadMinimalismData();
			if (!data || data.length === 0) {
				mainContainer.innerHTML += '<div style="text-align: center; padding: 20px;">未找到数据，请检查数据文件路径设置。</div>';
				containerEl.appendChild(mainContainer);
				return;
			}
			
			// 添加统计面板
			const statsPanel = this.createStatsPanel(data);
			mainContainer.appendChild(statsPanel);
			
			// 添加日历表格
			const tableContainer = this.createCalendarTable(data);
			mainContainer.appendChild(tableContainer);
			
			// 添加翻转卡片的事件监听
			setTimeout(() => {
				this.addFlipCardListeners();
			}, 200);
			
		} catch (error) {
			mainContainer.innerHTML += `<div style="text-align: center; padding: 20px; color: red;">加载数据失败: ${error.message}</div>`;
		}
		
		containerEl.appendChild(mainContainer);
	}
	
	// 加载极简主义数据
	async loadMinimalismData() {
		try {
			// 获取数据文件路径
			const filePath = this.plugin.settings.dataFilePath;
			const fileObj = this.app.vault.getAbstractFileByPath(filePath);
			
			if (!fileObj || !(fileObj instanceof TFile)) {
				console.error('数据文件不存在:', filePath);
				return [];
			}
			
			// 读取文件内容
			const content = await this.app.vault.read(fileObj);
			
			// 尝试从文件中提取markdown表格
			const tableRegex = /\|(.+)\|\n\|([-:\s|]+)\|\n((?:\|.+\|\n?)+)/g;
			const tableMatch = tableRegex.exec(content);
			
			if (tableMatch) {
				// 提取表头和数据行
				const headerLine = tableMatch[1];
				const dataLines = tableMatch[3].trim().split('\n');
				
				// 解析表头
				const headers = headerLine.split('|')
					.map(h => h.trim())
					.filter(h => h.length > 0);
				
				// 解析数据行
				const allData = dataLines.map(line => {
					const values = line.split('|')
						.map(v => v.trim())
						.filter(v => v.length > 0);
					
					if (values.length !== headers.length) {
						console.warn(`行数据与表头不匹配: ${line}`);
						return null;
					}
					
					// 创建数据对象
					const rowData: {[key: string]: any} = {};
					headers.forEach((header, index) => {
						// 尝试将数值字段转换为数字
						const value = values[index];
						if (['使用频率', '必要性', '不可替代性', '空间负担', '多功能性', '情感价值', '维护费用', '获取成本'].includes(header)) {
							rowData[header] = Number(value) || 0;
						} else {
							rowData[header] = value;
						}
					});
					
					return rowData;
				}).filter(item => item !== null);
				
				// 转换为内部数据格式
				const formattedData = allData.map((row: any) => {
					// 处理日期格式
					let dateStr = row['日期'] || '';
					dateStr = dateStr.replace(/-/g, '');
					
					return {
						date: dateStr,
						item: row['物品'] || '',
						memory: row['记忆'] || '',
						epitaph: row['告别语'] || '',
						category: row['分类'] || 'default',
						freq: Number(row['使用频率']) || 0,
						necessity: Number(row['必要性']) || 0,
						irreplace: Number(row['不可替代性']) || 0,
						space: Number(row['空间负担']) || 0,
						multifunction: Number(row['多功能性']) || 0,
						emotion: Number(row['情感价值']) || 0,
						maintenance: Number(row['维护费用']) || 0,
						cost: Number(row['获取成本']) || 0
					};
				});
				
				// 根据选定的年份和月份过滤数据
				const year = this.plugin.settings.challengeYear;
				const month = this.plugin.settings.challengeMonth;
				const yearMonthPrefix = `${year}${String(month).padStart(2, '0')}`;
				
				// 过滤出当前年月的数据，确保日期格式正确
				const filteredData = formattedData.filter((item: any) => {
					// 确保日期是8位数字格式 YYYYMMDD
					if (item.date.length !== 8) {
						console.warn(`跳过无效日期格式: ${item.date}`);
						return false;
					}
					
					// 检查年月是否匹配
					const itemYearMonth = item.date.substring(0, 6);
					const matches = itemYearMonth === yearMonthPrefix;
					
					if (matches) {
						console.log(`匹配到记录: ${item.date}, 物品: ${item.item}`);
					}
					
					return matches;
				});
				
				console.log(`已从markdown表格加载 ${year}年${month}月的数据:`, filteredData);
				return filteredData;
			} else {
				// 如果没有找到markdown表格，尝试从JSON部分读取
				const jsonRegex = /```json\s*\n(\[[\s\S]*?\])\s*\n```/;
				const jsonMatch = jsonRegex.exec(content);
				
				if (jsonMatch) {
					const jsonString = jsonMatch[1];
					const rawData = JSON.parse(jsonString);
					
					const formattedData = rawData.map((row: any) => ({
						date: row['日期'].replace(/-/g, ''),
						item: row['物品'],
						memory: row['记忆'] || '',
						epitaph: row['告别语'] || '',
						category: row['分类'] || 'default',
						freq: Number(row['使用频率']) || 0,
						necessity: Number(row['必要性']) || 0,
						irreplace: Number(row['不可替代性']) || 0,
						space: Number(row['空间负担']) || 0,
						multifunction: Number(row['多功能性']) || 0,
						emotion: Number(row['情感价值']) || 0,
						maintenance: Number(row['维护费用']) || 0,
						cost: Number(row['获取成本']) || 0
					}));
					
					// 根据选定的年份和月份过滤数据
					const year = this.plugin.settings.challengeYear;
					const month = this.plugin.settings.challengeMonth;
					const yearMonthPrefix = `${year}${String(month).padStart(2, '0')}`;
					
					// 过滤出当前年月的数据
					const filteredData = formattedData.filter((item: any) => 
						item.date.startsWith(yearMonthPrefix) || 
						(item.date.length === 8 && item.date.substring(0, 6) === yearMonthPrefix)
					);
					
					console.log(`已从JSON加载 ${year}年${month}月的数据:`, filteredData);
					return filteredData;
				}
			}
			
			console.error('未在文件中找到有效的数据格式');
			return [];
		} catch (error) {
			console.error('加载数据失败:', error);
			return []; // 发生错误时返回空数组
		}
	}
	// 计算得分 - 修复重复定义和语法错误
		// 计算得分 - 使用自定义权重
		calculateScore(item: any) {
			const weights = this.plugin.settings.scoreWeights;
    
			// 计算权重总和
			const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
			
			// 归一化权重
			const normalizedWeights = Object.fromEntries(
				Object.entries(weights).map(([key, weight]) => [key, weight / totalWeight])
			);
			
			const weightedScores = [
				item.freq * normalizedWeights.freq,          
				item.necessity * normalizedWeights.necessity,     
				item.irreplace * normalizedWeights.irreplace,     
				item.space * normalizedWeights.space,         
				item.multifunction * normalizedWeights.multifunction, 
				item.emotion * normalizedWeights.emotion,       
				item.maintenance * normalizedWeights.maintenance,   
				item.cost * normalizedWeights.cost          
			];
			
			// 计算最终得分（权重已归一化，无需再次除以权重总和）
			const baseScore = weightedScores.reduce((sum, score) => sum + score, 0);
			
			const lifeStageMultiplier = this.getLifeStageMultiplier(this.plugin.settings.lifeStage);
			const finalScore = baseScore * lifeStageMultiplier;
			
			return Math.min(100, Math.max(0, finalScore));
		}
	// 创建统计面板
	// 创建统计面板
	createStatsPanel(data: any[]) {
		// 导出颜色和图标映射
		const setcolors = Object.fromEntries(
			Object.entries(ITEM_CATEGORIES).map(([key, value]) => [key, value.color])
		);
		
		const categoryIcons = Object.fromEntries(
			Object.entries(ITEM_CATEGORIES).map(([key, value]) => [key, value.icon])
		);
		
		// 计算统计数据
		const monthStats = data.reduce((stats: any, item: any) => {
			const score = this.calculateScore(item);
			stats.totalScore += score;
			stats.itemCount++;
			stats.categories[item.category] = (stats.categories[item.category] || 0) + 1;
			return stats;
		}, { totalScore: 0, itemCount: 0, categories: {} });
		
		// 确保所有预定义类目都存在于统计中，即使没有数据
		Object.keys(ITEM_CATEGORIES).forEach(category => {
			if (category !== 'default' && !monthStats.categories[category]) {
				monthStats.categories[category] = 0;
			}
		});
		
		// 创建统计面板
		const statsPanel = document.createElement('div');
		statsPanel.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 15px;
			margin: 20px 0;
			padding: 20px;
		`;
		
		// 更新统计面板的HTML结构
		statsPanel.innerHTML = `
			<div class="stats-grid" style="
			display: grid;
			grid-template-columns: 1fr;  /* 默认单列布局 */
			gap: clamp(10px, 2vw, 20px);
			margin-bottom: clamp(10px, 2vw, 15px);
			width: 100%;
		">
			<div style="
				display: grid;
				grid-template-columns: minmax(150px, 1fr) minmax(200px, 2fr);  /* 修改最小宽度 */
				gap: clamp(10px, 2vw, 20px);
				width: 100%;
				@media (max-width: 768px) {
					grid-template-columns: 1fr;  /* 在小屏幕上变为单列 */
				}
			">
				<div style="
					display: flex;
					align-items: center;
					padding: clamp(15px, 3vw, 25px);  /* 使用 clamp 使padding自适应 */
					border-radius: 12px;
					min-width: 0;  /* 防止溢出 */
				">
					<div style="
						width: clamp(40px, 8vw, 60px);  /* 图标大小自适应 */
						height: clamp(40px, 8vw, 60px);
						display: flex;
						align-items: center;
						justify-content: center;
						border-radius: 12px;
						margin-right: clamp(10px, 3vw, 20px);
					">
						<span style="font-size: clamp(2em, 4vw, 3.2em);">📦</span>
					</div>
					<div>
						<div style="
							font-size: clamp(1.5em, 3vw, 2em);
							font-weight: 600;
							color: var(--text-normal);
							margin-bottom: 4px;
						">${monthStats.itemCount}</div>
						<div style="
							font-size: clamp(0.8em, 1.5vw, 0.9em);
							color: var(--text-muted);
						">待处理物品</div>
					</div>
				</div>

				<div style="
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));  /* 修改为自适应列数 */
					gap: clamp(8px, 1.5vw, 15px);
					padding: clamp(10px, 2vw, 15px);
					border-radius: 0px;
					align-items: start;
					min-width: 0;
				">
					${Object.entries(monthStats.categories)
					.sort((a, b) => {
						const orderA = ITEM_CATEGORIES[a[0]]?.order || 999;
						const orderB = ITEM_CATEGORIES[b[0]]?.order || 999;
						return orderA - orderB;
					})
					.map(([category, count]) => `
						<div style="
							display: flex;
							align-items: center;
							gap: 0.5rem;
							padding: 0.3rem 0.6rem;
							background: ${setcolors[category] || setcolors.default}99;
							border-radius: 15px;
							border: 0px dashed ${setcolors[category] || setcolors.default}99;
							width: 100%;
							height: 30px;
							margin: auto;
						">
							<span style="
								font-size: 1.4em;
								min-width: 20px;
								text-align: center;
								flex-shrink: 0;
							">${categoryIcons[category] || categoryIcons.default}</span>
							<div style="
								display: flex;
								align-items: center;
								gap: 4px;
								flex: 1;
								justify-content: space-between;
								min-width: 0;
							">
								<span style="
									font-size: 0.8em;
									font-weight: 500;
									color: var(--text-muted);
									white-space: nowrap;
									overflow: hidden;
									text-overflow: ellipsis;
									max-width: 70%;
								">${category}</span>
								<span style="
									font-size: 1em;
									font-weight: 500;
									color: var(--text-normal);
									flex-shrink: 0;
									margin-right: 8px;
								">${count}</span>
							</div>
						</div>
					`).join('')}
				</div>
			</div>
		
			`;		
		
		// 添加得分指导说明
		const scoreGuide = document.createElement('div');
		scoreGuide.style.cssText = `
			position: relative;
			padding: 8px;
			border-radius: 12px;
			font-size: 0.85em;
			margin-bottom: -15px;
		`;
		
		scoreGuide.innerHTML = `
			<div style="
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
				gap: 10px;
				color: var(--text-normal);
				margin-bottom: 15px;
				overflow-x: auto;
			">
				${[
					{score: '80-100', label: '必须保留', icon: "🗂️"},
					{score: '60-79', label: '建议保留', icon: "📥"},
					{score: '40-59', label: '灵活处理', icon: "🔄"},
					{score: '20-39', label: '推荐舍弃', icon: "📤"},
					{score: '0-19', label: '立即处理', icon: "🗑️"}
				].map(item => `
					<div style="
						display: flex;
						align-items: center;
						gap: 8px;
						width: 100%;
						padding: 3px 8px;
						border-radius: 20px;
					">
						<span style="
							display: inline-block;
							width: 6px;
							height: 6px;
							border-radius: 50%;
						"></span>
						<span>${item.icon}</span>
						<span style="font-weight: 500;">${item.score}</span>
						<span>${item.label}</span>
					</div>
				`).join('')}
			</div>
			<div style="
				position: absolute;
				bottom: -5px;
				left: 0;
				width: 100%;
				height: 1px;
				background: var(--background-modifier-border);
				opacity: 0.8;
			"></div>
		`;
		
		statsPanel.appendChild(scoreGuide);
		return statsPanel;
	}
	
	// 创建日历表格
	createCalendarTable(data: any[]) {
		// 获取分类颜色和图标
		function getCategoryColor(category: string) {
			return ITEM_CATEGORIES[category]?.color || ITEM_CATEGORIES.default.color;
		}
		
		function getCategoryIcon(category: string) {
			return ITEM_CATEGORIES[category]?.icon || ITEM_CATEGORIES.default.icon;
		}
		
		// 获取处理方式
		function getDisposalMethod(score: number) {
			const thresholds = Object.keys(DISPOSAL_METHODS)
				.map(Number)
				.sort((a, b) => b - a);
			
			for (const threshold of thresholds) {
				if (score >= threshold) {
					return DISPOSAL_METHODS[threshold];
				}
			}
			return DISPOSAL_METHODS[0];
		}
		
		// 创建表格容器
		const tableContainer = document.createElement('div');
		tableContainer.style.cssText = `
			width: 100%;
			margin: 30px 0px;
			padding: 0;
		`;
		
		// 生成表格HTML
		let tableHtml = `<div class="grid-container" style=" 
			display: grid; 
			grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); 
			gap: clamp(10px, 2vw, 15px); 
			width: 100%;
		">`;
		
		const totalDays = 30;
		const challengeMonth = this.plugin.settings.challengeMonth;
		
		// 生成卡片
		for (let day = 1; day <= totalDays; day++) {
			// 使用设置中的年份而不是硬编码或当前年份
			const year = this.plugin.settings.challengeYear;
			const month = this.plugin.settings.challengeMonth;
			const dateStr = `${year}${String(month).padStart(2,'0')}${String(day).padStart(2,'0')}`;
			// 添加调试日志
			if (day === 1) {
				console.log("查找日期:", dateStr);
				console.log("可用数据:", data);
			}
			
			const dayRecord = data.find(item => {
				// 标准化日期格式为 YYYYMMDD
				const formattedDate = dateStr;
				const itemDate = item.date;
				
				// 直接比较标准化后的日期
				const matches = itemDate === formattedDate;
				
				if (day === 1) {
					console.log(`比较日期: ${formattedDate} vs ${itemDate}, 匹配: ${matches}`);
				}
				
				return matches;
			});
			
			if (day === 1 && dayRecord) {
				console.log("找到第1天记录:", dayRecord);
			}
			
			const dayLabel = `Day ${day}`; // 确保这个变量在所有使用
			
			// 前面卡片 - 告别语
			let frontCard = dayRecord ? `
				<div class="card-front" style="
					position: absolute;
					width: 100%;
					height: 100%;
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					backface-visibility: hidden;
					transition: transform 0.6s;
					background: ${getCategoryColor(dayRecord.category)};
					border-radius: 12px;
					padding: 10px;
					opacity: 0.9;
				">
					<div class="item-card" style="
						display: flex;
						flex-direction: column;
						position: relative;
						gap: 5px;
						width: 100%;
						height: 100%;
						color: white;
					">
						<div style="
							font-size: clamp(0.8em, 1.5vw, 0.9em);
    						line-height: 1.4;
							font-weight: 600;
							font-family: 'Inter', -apple-system, sans-serif;
							opacity: 0.9;
							text-align: right;
							position: absolute;
							top: 2px;
							right: 5px;
						">${dayLabel}</div>
						<div style="
							font-size: 0.95em;
							line-height: 1.4;
							position: absolute;
							top: 40%;
							left: 50%;
							transform: translate(-50%, -50%);
							text-align: center;
							width: 98%;
							overflow-wrap: break-word;
						">${dayRecord.epitaph || dayRecord.item}</div>
						<div style="
							display: flex;
							justify-content: space-between;
							align-items: center;
							padding: 8px 1px;
							border-top: 1px dashed rgba(255,255,255,0.2);
							position: absolute;
							bottom: 3px;
							left: 0;
							right: 0;
							margin: 0 5px;
						">
							<span style="
								display: flex;
								align-items: center;
								margin-left: 5px;
								font-size: 0.95em;
							">${getCategoryIcon(dayRecord.category)}</span>
							<span style="
								font-size: 0.75em;
								padding: 2px 8px;
								border-radius: 20px;
								background: rgba(255,255,255,0.2);
								display: flex;
								align-items: center;
								gap: 4px;
							">
								<div style="
									font-weight: 500;
									color: rgba(255,255,255,0.9);
								">${Math.round(this.calculateScore(dayRecord))}</div>
								${getDisposalMethod(this.calculateScore(dayRecord)).icon}
							</span>
						</div>
					</div>
				</div>` : `
				<div class="card-front" style="
					position: absolute;
					width: 100%;
					height: 100%;
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					backface-visibility: hidden;
					background: ${ITEM_CATEGORIES.default.color};
					border-radius: 12px;
					padding: 10px;
				">
					<div style="
						color: white;
						font-size: 0.9em;
						font-weight: 500;
						font-family: 'Inter', -apple-system, sans-serif;
						text-align: right;
					">${dayLabel}</div>
				</div>`;
			
			// 后面卡片 - 显示物品名称和记忆
			let backCard = dayRecord ? `
				<div class="card-back" style="
					position: absolute;
					width: 100%;
					height: 100%;
					display: flex;
					flex-direction: column;
					backface-visibility: hidden;
					transform: rotateY(180deg);
					transition: transform 0.6s;
					background: ${getCategoryColor(dayRecord.category)};
					border-radius: 12px;
					padding: 15px 14px;
					color: white;
				">
					
					<h3 style="
						margin: 5px 0 8px;
						text-align: center;
						font-size: 0.9em;
						font-weight: 500;
						letter-spacing: 0.3px;
						opacity: 0.9;
					">${dayRecord.item}</h3>
					
					<div style="
						flex-grow: 1;
						width: 100%;
						overflow-y: auto;
						scrollbar-width: thin;
						scrollbar-color: rgba(255,255,255,0.3) transparent;
					">
						<p style="
							margin: 0;
							font-size: 0.8em;
							line-height: 1.5;
							padding: 0 5px;
							text-align: left;
							opacity: 0.85;
						">${dayRecord.memory}</p>
					</div>
				</div>` : '';
			
			// 组合卡片
			tableHtml += `
				<div class="flip-card" style="
					width: 100%;
					height: 150px;
					perspective: 1000px;
					cursor: ${dayRecord ? 'pointer' : 'default'};
				">
					<div class="flip-card-inner" style="
						position: relative;
						width: 100%;
						height: 100%;
						text-align: center;
						transition: transform 0.7s cubic-bezier(0.68, -0.6, 0.32, 1.6);
						transform-style: preserve-3d;
					">
						${frontCard}
						${backCard}
					</div>
				</div>`;
		}
		
		tableHtml += `</div>`;
		tableContainer.innerHTML = tableHtml;
		
		return tableContainer;
	}
	
	// 添加翻转卡片的事件监听
	// 修复 addFlipCardListeners 方法
	addFlipCardListeners() {
		const flipCards = document.querySelectorAll('.flip-card');
		
		flipCards.forEach(card => {
			const inner = card.querySelector('.flip-card-inner');
			const backCard = card.querySelector('.card-back');
			
			if (!backCard) return; // 如果没有背面卡片（空白日期）则不添加事件
			
			let isFlipped = false;
			
			// 检查 inner 元素是否存在
			if (!inner) return;
			
			// 添加点击事件处理
			card.addEventListener('click', () => {
				isFlipped = !isFlipped;
				if (isFlipped) {
					(inner as HTMLElement).style.transform = 'rotateY(180deg)';
				} else {
					(inner as HTMLElement).style.transform = 'rotateY(0deg)';
				}
			});
		});
	}
	
	

	// 获取生活阶段系数
	getLifeStageMultiplier(stage: number) {
		const multipliers: { [key: number]: number } = {
			1: 0.8,  // 简约阶段
			2: 1.0,  // 平衡阶段
			3: 1.3   // 积累阶段
		};
		return multipliers[stage] || 1.0;
	}
	
	// 修改 onClose 方法返回 Promise<void>
	async onClose(): Promise<void> {
		const {contentEl} = this;
		contentEl.empty();
	}
}

// 创建设置选项卡
class MinimalismChallengeSettingTab extends PluginSettingTab {
	plugin: MinimalismChallengePlugin;
	markdownTextarea: HTMLTextAreaElement;

	constructor(app: App, plugin: MinimalismChallengePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// 修改设置选项卡的 display 方法
	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: '极简主义挑战日历设置'});

		// 基本设置
		containerEl.createEl('h3', {text: '基本设置'});

		new Setting(containerEl)
			.setName('挑战年份')
			.setDesc('设置当前挑战的年份')
			.addText(text => text
				.setPlaceholder('输入年份')
				.setValue(this.plugin.settings.challengeYear.toString())
				.onChange(async (value) => {
					const year = parseInt(value);
					if (!isNaN(year) && year > 2000 && year < 2100) {
						this.plugin.settings.challengeYear = year;
						await this.plugin.saveSettings();
					}
				})
				// 添加宽度限制
				.inputEl.style.width = '100px');

		new Setting(containerEl)
			.setName('挑战月份')
			.setDesc('设置当前挑战的月份')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'1': '1月', '2': '2月', '3': '3月', '4': '4月',
					'5': '5月', '6': '6月', '7': '7月', '8': '8月',
					'9': '9月', '10': '10月', '11': '11月', '12': '12月'
				})
				.setValue(this.plugin.settings.challengeMonth.toString())
				.onChange(async (value) => {
					this.plugin.settings.challengeMonth = parseInt(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('生活阶段')
			.setDesc('设置您当前的生活阶段，影响物品评分')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'1': '简约阶段 (0.8倍)',
					'2': '平衡阶段 (1.0倍)',
					'3': '积累阶段 (1.3倍)'
				})
				.setValue(this.plugin.settings.lifeStage.toString())
				.onChange(async (value) => {
					this.plugin.settings.lifeStage = parseInt(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName('数据文件路径')
		.setDesc('设置存储物品数据的文件路径')
		.addText(text => text
			.setPlaceholder('minimalism_items.md')
			.setValue(this.plugin.settings.dataFilePath)
			.onChange(async (value) => {
				this.plugin.settings.dataFilePath = value;
				await this.plugin.saveSettings();
			}));
		
		// 添加创建模板文件按钮 - 只保留这一个
		new Setting(containerEl)
			.setName('创建数据模板')
			.setDesc('创建一个包含Markdown表格的模板文件，您可以直接在文件中编辑数据')
			.addButton(button => button
				.setButtonText('创建模板文件')
				.onClick(async () => {
					await this.plugin.createDataFileTemplate();
				}));
		// 评分指南

		// 评分权重设置 - 改进布局
		containerEl.createEl('h3', {text: '评分权重设置'});
		// 在所有设置项之后添加项目说明

		// 添加权重说明
		const weightDescription = containerEl.createEl('div', {
			attr: {
				style: 'margin-bottom: 20px; padding: 10px; background: var(--background-secondary); border-radius: 5px;'
			}
		});
		weightDescription.innerHTML = `
			<p style="margin: 0 0 10px 0; font-size: 0.9em;">评分计算说明：最终得分 = (各指标得分 × 归一化权重) × 生活阶段系数</p>
		`;
		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('重置设置')
				.onClick(async () => {
					await this.plugin.resetSettings();
					// 重新加载设置页面以显示新值
					this.display();
				}));
		// 创建一个统一的大外框
		const weightsContainer = containerEl.createEl('div', {
			attr: {
				style: 'border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 15px; background: var(--background-primary); margin-bottom: 20px;'
			}
		});

		// 创建网格布局容器
		const gridContainer = weightsContainer.createEl('div', {
			attr: {
				style: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;'
			}
		});

		// 定义评分因素
		const scoreFactors = [
			{id: 'freq', name: '使用频率', desc: '越常用分值越高'},
			{id: 'necessity', name: '必要性', desc: '对日常生活的必要程度'},
			{id: 'irreplace', name: '不可替代性', desc: '越难替代分值越高'},
			{id: 'space', name: '空间负担', desc: '占用空间越合理分值越高'},
			{id: 'multifunction', name: '多功能性', desc: '功能越多分值越高'},
			{id: 'emotion', name: '情感价值', desc: '情感价值越高分值越高'},
			{id: 'maintenance', name: '维护费用', desc: '维护成本越低分值越高'},
			{id: 'cost', name: '获取成本', desc: '性价比越高分值越高'}
		];

		// 为每个评分因素创建设置项，但不使用单独的边框
		scoreFactors.forEach(factor => {
			const factorContainer = gridContainer.createEl('div', {
				attr: {
					style: 'padding: 8px; border-bottom: 1px dashed var(--background-modifier-border);'
				}
			});
			
			// 创建标题和描述
			factorContainer.createEl('div', {
				text: factor.name,
				attr: {
					style: 'font-weight: 500; margin-bottom: 5px;'
				}
			});
			
			factorContainer.createEl('div', {
				text: factor.desc,
				attr: {
					style: 'font-size: 0.8em; color: var(--text-muted); margin-bottom: 8px;'
				}
			});
			
			// 创建滑块和值显示
			const sliderContainer = factorContainer.createEl('div', {
				attr: {
					style: 'display: flex; align-items: center; gap: 10px;'
				}
			});
			
			const slider = sliderContainer.createEl('input', {
				attr: {
					type: 'range',
					min: '0',
					max: '1',
					step: '0.1',
					value: this.plugin.settings.scoreWeights[factor.id].toString(),
					style: 'flex: 1;'
				}
			});
			
			const valueDisplay = sliderContainer.createEl('span', {
				text: this.plugin.settings.scoreWeights[factor.id].toString(),
				attr: {
					style: 'min-width: 30px; text-align: center;'
				}
			});
			
			// 添加事件监听
			slider.addEventListener('input', async (e) => {
				const value = parseFloat((e.target as HTMLInputElement).value);
				this.plugin.settings.scoreWeights[factor.id] = value;
				valueDisplay.textContent = value.toString();
				await this.plugin.saveSettings();
			});
		});
		containerEl.createEl('h3', {text: '项目说明'});
		
		const projectDescription = containerEl.createEl('div', {
			attr: {
				style: 'margin-top: 20px; padding: 15px; background: var(--background-secondary); border-radius: 8px; max-height: 500px; overflow-y: auto;'
			}
		});
		
		// 添加自定义滚动条样式
		const scrollbarStyle = containerEl.createEl('style', {
			text: `
				div[style*="max-height: 500px"] {
					scrollbar-width: thin;
					scrollbar-color: var(--scrollbar-thumb-bg) var(--scrollbar-track-bg);
				}
				div[style*="max-height: 500px"]::-webkit-scrollbar {
					width: 8px;
				}
				div[style*="max-height: 500px"]::-webkit-scrollbar-track {
					background: var(--background-secondary-alt);
					border-radius: 4px;
				}
				div[style*="max-height: 500px"]::-webkit-scrollbar-thumb {
					background: var(--scrollbar-thumb-bg, rgba(0, 0, 0, 0.2));
					border-radius: 4px;
				}
				div[style*="max-height: 500px"]::-webkit-scrollbar-thumb:hover {
					background: var(--scrollbar-thumb-bg-hover, rgba(0, 0, 0, 0.3));
				}
			`
		});
		
		projectDescription.innerHTML = `
			<h4 style="margin-top: 0; margin-bottom: 10px; color: var(--text-normal);">为什么要做极简主义挑战？</h4>
			<p style="margin-bottom: 15px; font-size: 0.9em; line-height: 1.5; color: var(--text-normal);">
				极简主义挑战（Minimalism Game）是一种帮助人们减少物品占用、简化生活的实践方法。在现代消费社会中，我们往往积累了大量不必要的物品，这些物品不仅占用空间，还会消耗我们的精力和注意力。生活越简单，就有越多时间可专注在健康、关系、创造力、职涯上。通过这个挑战，我们可以：
				<ul style="margin-top: 8px; padding-left: 20px; font-size: 0.9em;">
					<li>重新审视我们与物品的关系</li>
					<li>减少不必要的物质占有</li>
					<li>为真正重要的事物腾出空间</li>
					<li>培养更加自觉的消费习惯</li>
					<li>减轻心理负担，获得更多自由感</li>
				</ul>
			</p>
			
			<h4 style="margin-bottom: 10px; color: var(--text-normal);">挑战规则说明</h4>
			<p style="font-size: 0.9em; line-height: 1.5; color: var(--text-normal);">
				极简主义挑战的基本规则如下：
				<ol style="margin-top: 8px; padding-left: 20px; font-size: 0.9em;">
					<li><strong>为期30天</strong>：挑战持续一个月（30天）。</li>
					<li><strong>每日处理物品</strong>：每天需要处理掉1件物品。</li>
					<li><strong>记录与反思</strong>：对于每件物品，记录它的基本信息、使用历史、情感联系，以及为什么决定处理它。</li>
					<li><strong>评分系统</strong>：通过多个维度（使用频率、必要性、情感价值等）对物品进行评分，帮助决定是否保留。</li>
					<li><strong>处理方式</strong>：根据物品的评分和状态，选择适当的处理方式：
						<ul style="margin-top: 5px; padding-left: 15px;">
							<li>捐赠：适合状态良好但不再需要的物品</li>
							<li>出售：有一定价值的物品</li>
							<li>回收：不能继续使用但可回收的物品</li>
							<li>丢弃：无法回收且无使用价值的物品</li>
							<li>重新安置：仍有价值但需要更合适位置的物品</li>
						</ul>
					</li>
				</ol>
			</p>
			
			<h4 style="margin-bottom: 10px; color: var(--text-normal);">使用建议</h4>
			<p style="font-size: 0.9em; line-height: 1.5; color: var(--text-normal);">
				<ul style="padding-left: 20px; font-size: 0.9em;" >
					<li>从简单的物品开始，逐渐过渡到更有情感联系的物品</li>
					<li>邀请朋友或家人一起参与，互相鼓励和监督</li>
					<li>不要急于求成，关注过程中的感受和变化</li>
					<li>定期回顾记录，反思自己的消费和持有习惯</li>
					<li>完成挑战后，尝试将极简理念融入日常生活</li>
				</ul>
			</p>
			
			<div style="margin-top: 15px; font-size: 0.9em; font-style: italic; color: var(--text-muted); text-align: center;">
				"拥有更少，体验更多"
			</div>

			<h4 style="margin-bottom: 10px; color: var(--text-normal);">插件使用说明</h4>
			<p style="font-size: 0.9em; line-height: 1.5; color: var(--text-normal);">
				<ol style="padding-left: 20px; font-size: 0.9em;">
					<li><strong>初始设置</strong>：
						<ul style="margin-top: 5px; padding-left: 15px;">
							<li>安装插件后，在设置中设置挑战年份和月份</li>
							<li>选择适合您的生活阶段（简约、平衡或积累）</li>
							<li>设置数据文件路径，默认为 minimalism_items.md</li>
							<li>点击"创建模板文件"按钮生成初始数据文件</li>
						</ul>
					</li>
					<li><strong>调整评分权重</strong>：
						<ul style="margin-top: 5px; padding-left: 15px;">
							<li>根据您的个人情况调整各项评分因素的权重</li>
							<li>权重范围从0到1，数值越高表示该因素越重要</li>
							<li>如需恢复默认设置，点击"重置设置"按钮</li>
						</ul>
					</li>
					<li><strong>记录物品</strong>：
						<ul style="margin-top: 5px; padding-left: 15px;">
							<li>打开生成的数据文件（默认为 minimalism_items.md）</li>
							<li>在Markdown表格中添加新的物品记录</li>
							<li>按照表头格式填写物品信息和各项评分</li>
							<li>日期格式为 YYYY-MM-DD，如 2023-05-01</li>
						</ul>
					</li>
					<li><strong>查看日历视图</strong>：
						<ul style="margin-top: 5px; padding-left: 15px;">
							<li>点击左侧边栏中的"极简主义挑战日历"图标</li>
							<li>日历视图会显示当前月份已记录的物品</li>
							<li>点击卡片可以翻转查看物品详细信息</li>
							<li>顶部统计面板显示物品总数和分类统计</li>
						</ul>
					</li>
					<li><strong>评分解读</strong>：
						<ul style="margin-top: 5px; padding-left: 15px;">
							<li>80-100分：必须保留的物品</li>
							<li>60-79分：建议保留的物品</li>
							<li>40-59分：可灵活处理的物品</li>
							<li>20-39分：推荐舍弃的物品</li>
							<li>0-19分：建议立即处理的物品</li>
						</ul>
					</li>
					<li><strong>数据管理</strong>：
						<ul style="margin-top: 5px; padding-left: 15px;">
							<li>所有数据保存在Markdown文件中，便于备份和迁移</li>
							<li>可以随时编辑数据文件修改已有记录</li>
							<li>修改后重新打开日历视图即可看到更新</li>
						</ul>
					</li>
				</ol>
			</p>
		`;
		

	}
	
}

