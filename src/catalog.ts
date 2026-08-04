export type CategoryKey =
  | "microbiome"
  | "methods"
  | "muscle"
  | "wetlab"
  | "omics"
  | "design";

export type Topic = {
  id: string;
  title: string;
  short: string;
  category: CategoryKey;
  difficulty: 1 | 2 | 3;
  tags: string[];
  goal: string;
  plan: [string, string, string];
  prerequisites?: string[];
};

export const CATEGORY_META: Record<
  CategoryKey,
  { label: string; subtitle: string; color: string; soft: string; defaultWeight: number }
> = {
  microbiome: {
    label: "微生物组",
    subtitle: "生成、功能与宿主暴露",
    color: "#1e8476",
    soft: "#e2f3ef",
    defaultWeight: 1.45,
  },
  methods: {
    label: "统计与图表",
    subtitle: "把结果读对、做对、讲清",
    color: "#4d63c8",
    soft: "#e8ebff",
    defaultWeight: 1.28,
  },
  muscle: {
    label: "肌肉与线粒体",
    subtitle: "从机制到功能终点",
    color: "#c26937",
    soft: "#fff0e5",
    defaultWeight: 1.42,
  },
  wetlab: {
    label: "湿实验",
    subtitle: "可复现的实验判断",
    color: "#be4d77",
    soft: "#fdebf2",
    defaultWeight: 1.18,
  },
  omics: {
    label: "单细胞与多组学",
    subtitle: "从数据质控到整合",
    color: "#8257bd",
    soft: "#f1eafb",
    defaultWeight: 1.15,
  },
  design: {
    label: "研究设计",
    subtitle: "证据链、因果与批判性阅读",
    color: "#438550",
    soft: "#e9f5eb",
    defaultWeight: 1.35,
  },
};

const t = (
  id: string,
  title: string,
  short: string,
  category: CategoryKey,
  difficulty: 1 | 2 | 3,
  tags: string[],
  goal: string,
  plan: [string, string, string],
  prerequisites?: string[],
): Topic => ({ id, title, short, category, difficulty, tags, goal, plan, prerequisites });

export const TOPICS: Topic[] = [
  t("16s-asv", "16S 扩增子：FASTQ 到 ASV", "16S→ASV", "microbiome", 1, ["16S", "DADA2", "ASV"], "画出从原始 reads 到 ASV 表、分类表和多样性分析的完整链条。", ["区分去引物、去噪和去嵌合体各自解决的问题。", "读懂 DADA2 的 reads 保留统计。", "说清 feature table、代表序列和 taxonomy 的关系。"]),
  t("asv-otu", "ASV、OTU 与 feature table", "ASV/OTU", "microbiome", 1, ["16S", "丰度表"], "能解释为什么现代扩增子研究更常使用 ASV，而不是 97% OTU。", ["用测序错误例子比较 OTU 聚类与 ASV 推断。", "明确矩阵的行、列和丰度值。", "写出 taxonomy 不能等同功能的理由。"], ["16s-asv"]),
  t("alpha-beta", "α/β 多样性、稀释与深度", "α/β多样性", "microbiome", 1, ["diversity", "rarefaction"], "能为菌群研究选择合适的多样性指标，并说明稀释曲线的边界。", ["比较 richness、Shannon、Faith PD。", "比较 Bray–Curtis、Jaccard 与 UniFrac。", "说明深度不足会怎样改变结论。"], ["16s-asv"]),
  t("pcoa-permanova", "PCoA、PERMANOVA 与离散度", "PCoA/PERM", "microbiome", 2, ["PCoA", "PERMANOVA", "beta diversity"], "不把组间距离图或 PERMANOVA 显著误读成机制或确定的组间组成差异。", ["区分 PCA 与 PCoA 的输入。", "解释 PERMANOVA 与 betadisper 要共同读取。", "为一个图写出保守结论。"], ["alpha-beta"]),
  t("clr-compositional", "组成型数据、CLR 与假相关", "CLR/组成型", "microbiome", 2, ["relative abundance", "CLR"], "理解相对丰度相加为 1 如何制造假相关，并知道 CLR 的用途与限制。", ["用闭合效应解释“某菌升高”。", "说明零值处理的重要性。", "列出绝对定量能补上的信息。"], ["asv-otu"]),
  t("ancombc-fdr", "差异丰度：ANCOM-BC 与 FDR", "差异丰度", "microbiome", 2, ["ANCOM-BC", "FDR"], "能审查差异丰度结论是否考虑多重比较与组成型偏差。", ["区分 P 值、q 值和 FDR。", "比较 ANCOM-BC 与简单 t 检验。", "写出含效应量与方向的结果句。"], ["clr-compositional"]),
  t("fmt-causality", "FMT：从相关到因果的设计", "FMT 因果", "microbiome", 2, ["FMT", "causality"], "判断粪菌移植是否把供体效应、受体效应和环境效应真正拆开。", ["列出供体、受体、笼位、批次等混杂。", "拆开 engraftment、代谢物和肌肉表型。", "写一个最小对照组。"], ["alpha-beta"]),
  t("scfa-muscle", "SCFA：产生、暴露与肌肉", "SCFA→肌肉", "microbiome", 1, ["SCFA", "AMPK", "muscle"], "把纤维发酵、交叉营养、肠上皮利用和肌肉信号串成可检验链条。", ["区分乙酸、丙酸和丁酸的主要去向。", "解释粪便 SCFA 不能代表系统暴露。", "为 SCFA–AMPK 选取采样和对照。"]),
  t("bile-acid", "胆汁酸：BSH/bai 到 FXR/TGR5", "胆汁酸轴", "microbiome", 2, ["bile acid", "FXR", "TGR5"], "解释菌群如何改写胆汁酸池，并区分受体激活与肌肉结局证据。", ["梳理脱结合、7α-脱羟化与肠肝循环。", "比较 FXR、TGR5 的位置和读出。", "指出单时间点血清测量的局限。"], ["scfa-muscle"]),
  t("trp-ahr", "色氨酸代谢物、AhR 与肌肉", "Trp/AhR", "microbiome", 2, ["tryptophan", "AhR", "uremia"], "区分吲哚、犬尿氨酸和吲哚硫酸，并定位宿主共代谢环节。", ["画出菌群与宿主两条分流。", "解释 AhR 激活并不天然代表有益。", "用肾清除解释暴露量差异。"], ["scfa-muscle"]),
  t("pca-plsda", "PCA、PLS-DA 与过拟合", "PCA/PLS-DA", "methods", 1, ["PCA", "PLS-DA", "multivariate"], "能从目的、监督性和验证方式区分 PCA 与 PLS-DA。", ["读懂 component 与变异比例。", "识别 R2 高、Q2 低的过拟合警报。", "解释 permutation test。"]),
  t("heatmap", "热图：距离、聚类与颜色", "热图", "methods", 1, ["heatmap", "clustering"], "判断热图是在展示绝对值、Z-score 还是相对丰度，且不被颜色误导。", ["比较 Euclidean、correlation、Bray–Curtis。", "解释 row scaling 改变和不改变什么。", "识别聚类树不能自动证明亚型。"]),
  t("volcano-fdr", "火山图：效应量、P 值与 FDR", "火山图", "methods", 1, ["volcano", "FDR", "DE"], "把火山图转换成可复核的统计叙述，而不是只挑红点。", ["解释 log2 fold change 与 -log10 P。", "区分统计阈值与生物学阈值。", "比较火山图、MA 图和森林图。"]),
  t("gwas", "GWAS：从位点到因果", "GWAS", "methods", 2, ["GWAS", "LD", "causality"], "读懂曼哈顿图、summary statistics 和“关联不等于因果”的边界。", ["解释 genome-wide significance、LD、lead SNP。", "区分 SNP、基因、通路。", "用肌肉或代谢性状做一次文献阅读。"]),
  t("mitophagy-flux", "线粒体自噬：怎样证明通量", "自噬通量", "muscle", 2, ["mitophagy", "mt-Keima", "PINK1"], "区分“标志物增加”与“自噬通量增加”，并能给出必要对照。", ["比较 LC3/p62、溶酶体抑制和 mt-Keima。", "把 PINK1–Parkin 招募与通量完成拆开。", "指出单时间点组织样本的风险。"]),
  t("seahorse", "Seahorse：OCR/ECAR 实验设计", "Seahorse", "muscle", 2, ["OCR", "ECAR", "mitochondria"], "能解释一条 OCR 曲线的基线、ATP-linked、maximal 和 spare capacity。", ["梳理 oligomycin、FCCP、Rot/AA。", "选择细胞数、蛋白或 DNA 归一化。", "列出铺板密度与药物滴定失败点。"]),
  t("muscle-endpoints", "肌肉终点：量、力、耐力", "肌肉终点", "muscle", 1, ["muscle", "strength", "CSA"], "为干预研究选择肌肉量、specific force、握力、耐力和胰敏中的合适终点。", ["区分 mass、CSA、absolute force、specific force。", "识别体重/活动量造成的假改善。", "为老年肌肉研究写一个主终点。"]),
  t("flow-gating", "流式细胞：对照与门控", "流式门控", "wetlab", 1, ["flow cytometry", "FMO", "gating"], "能画出从 events 到目标细胞群的可审计 gate tree。", ["解释 unstained、single-stain、FMO 和活死对照。", "区分补偿问题和阈值问题。", "为肌肉免疫/线粒体探针设计最小对照。"]),
  t("polysome", "多聚核糖体：翻译效率实验", "多聚核糖体", "wetlab", 2, ["translation", "polysome"], "能解释 polysome profiling 如何把 mRNA 丰度与翻译占用分开。", ["画出 sucrose gradient 各峰。", "理解 cycloheximide、RNase、EDTA 对照。", "给出“转录不变、翻译增强”的验证读出。"]),
  t("wb-quant", "WB：定量、归一化与误差", "WB 定量", "wetlab", 1, ["western blot", "normalization"], "能从原始条带到柱状图完整说明归一化、mean、SD、CV 和统计检验。", ["区分 loading control、total protein 和目标/内参。", "先算每个生物学重复再汇总。", "识别饱和曝光和伪重复。"]),
  t("qpcr-qc", "qPCR：Tm、熔解曲线与效率", "qPCR/QC", "wetlab", 1, ["qPCR", "Tm", "primer"], "能判断 Tm 为 NaN、单峰/多峰和扩增效率异常的更可能原因。", ["区分模板、引物、移液和阈值问题。", "解释 NTC、no-RT、标准曲线。", "写出 2^-ΔΔCt 的适用前提。"], ["wb-quant"]),
  t("if-colocalization", "免疫荧光：共定位是否可信", "IF 共定位", "wetlab", 2, ["immunofluorescence", "colocalization"], "判断共定位图是定位证据还是仅仅颜色重叠。", ["比较 Pearson、Manders、line scan。", "列出串色、抗体特异性和阈值控制。", "为 LC3/线粒体共定位设计正反对照。"], ["mitophagy-flux"]),
  t("elisa-qc", "ELISA：标准曲线与批内 QC", "ELISA", "wetlab", 1, ["ELISA", "standard curve"], "能检查 ELISA 是否处于线性范围，并正确处理稀释倍数与批次差异。", ["读懂 4PL 曲线与回算浓度。", "说明 duplicate 与可接受 CV。", "区分低于检测下限与真实零值。"]),
  t("lcms", "LC–MS：靶向与非靶向代谢组", "LC–MS", "wetlab", 2, ["LC-MS", "metabolomics"], "解释 metabolite feature、注释等级与绝对定量的差异。", ["比较 targeted、untargeted、pseudo-targeted。", "理解峰面积、内标和标准品。", "列出身份确认所需证据。"]),
  t("metabolomics-qc", "代谢组批次效应与 QC 样", "代谢组 QC", "wetlab", 2, ["QC", "batch effect", "metabolomics"], "审查一套 LC–MS 数据是否在漂移、缺失值和批次效应上可用。", ["解释 pooled QC、blank、随机进样。", "区分漂移校正与生物差异。", "设定 feature 缺失率与 QC-CV。"], ["lcms"]),
  t("isotope-tracing", "稳定同位素示踪：底物去了哪里", "同位素示踪", "wetlab", 3, ["13C", "flux", "tracing"], "用一个 13C 标记底物说清 enrichment、isotopologue 与 pool size 的不同。", ["区分摄入、组织暴露、代谢通量。", "解释 M+0、M+n 峰。", "为 SCFA/葡萄糖进入肌肉写最小实验。"], ["lcms", "scfa-muscle"]),
  t("absolute-quant", "16S 绝对定量与菌负荷", "绝对定量", "microbiome", 2, ["absolute abundance", "qPCR"], "知道相对丰度何时必须用 qPCR、spike-in 或 flow cytometry 补上绝对量。", ["比较总菌量、单位粪便 DNA、相对丰度。", "说明抗生素/腹泻模型的风险。", "把绝对量纳入差异丰度叙述。"], ["clr-compositional", "qpcr-qc"]),
  t("metagenomics", "宏基因组：物种、基因与通路", "宏基因组", "microbiome", 2, ["shotgun", "MAG", "pathway"], "从 shotgun reads 分清 taxonomic profile、gene family、MAG 和 pathway abundance。", ["比较 16S 与宏基因组的回答范围。", "解释功能潜力与实测代谢物的距离。", "为胆汁酸/SCFA 生成功能选验证读出。"], ["16s-asv"]),
  t("metatranscriptomics", "宏转录组：表达不是基因丰度", "宏转录组", "microbiome", 3, ["RNA", "microbial expression"], "解释 DNA 功能潜力、RNA 表达和终末代谢物为何可以彼此不一致。", ["列出 RNA 稳定性和宿主污染难点。", "理解归一化到测序深度的局限。", "构造“基因多但不表达”的例子。"], ["metagenomics"]),
  t("exposure-clearance", "肠—肝—肾：决定肌肉暴露", "暴露/清除", "microbiome", 2, ["exposure", "liver", "kidney"], "把“菌产生代谢物”与“肌肉真正暴露”拆成吸收、转化和清除。", ["说明丁酸上皮利用、TMA 肝氧化、硫酸化。", "解释肾功能下降如何放大毒素暴露。", "选择肠、血、尿三种样本。"], ["scfa-muscle"]),
  t("lps-barrier", "LPS、LBP、sCD14 与屏障", "LPS/屏障", "microbiome", 2, ["LPS", "barrier", "inflammation"], "判断“内毒素血症”是否只凭一个 LPS 检测就被过度声称。", ["比较 LPS、LBP、sCD14、zonulin。", "区分屏障损伤、免疫激活、肌肉分解。", "为 LPS–TLR4–FoxO 选中间读出。"], ["fmt-causality"]),
  t("bcaa", "BCAA：菌群、血浆与不完全氧化", "BCAA", "microbiome", 2, ["BCAA", "BCKDH", "insulin"], "解释血浆 BCAA 高可能来自摄入、分解受阻、菌群合成或组织利用改变。", ["画出 BCKDH 控制点。", "把关联与因果分开。", "列出肌肉和肝脏需共同测的指标。"], ["metagenomics"]),
  t("urolithin", "尿石素代谢型与线粒体自噬", "尿石素A", "microbiome", 2, ["urolithin A", "metabotype", "mitophagy"], "解释为何同样摄入膳食前体，个体之间可能没有相同尿石素 A 暴露。", ["区分前体、metabotype、血浆代谢物。", "梳理自噬结果与肌力结果的证据距离。", "设计反应异质性的分层分析。"], ["mitophagy-flux", "exposure-clearance"]),
  t("pgc1a", "AMPK–SIRT1–PGC-1α 生物发生", "AMPK/PGC-1α", "muscle", 2, ["AMPK", "PGC-1α", "biogenesis"], "把能量应激、转录共激活与生物发生从箭头变为可测节点。", ["区分 AMPK 磷酸化与 PGC-1α 总量。", "解释 mtDNA copy number 的边界。", "选取三个层级的 readout。"], ["seahorse"]),
  t("sirt3", "NAD+–SIRT3 与去乙酰化", "NAD+/SIRT3", "muscle", 3, ["NAD", "SIRT3", "acetylation"], "解释 NAD+ 补充、sirtuin 活性和线粒体表型间需要的中间证据。", ["区分 NAD+ 总量、比值、compartment。", "理解 SIRT3 靶蛋白乙酰化。", "识别“补 NAD+ 等于激活 SIRT3”。"], ["pgc1a"]),
  t("mito-dynamics", "线粒体融合、分裂与质量控制", "动力学", "muscle", 2, ["MFN", "OPA1", "DRP1"], "把 MFN1/2、OPA1、DRP1 的表达变化和真正网络功能区分开。", ["解释融合/分裂不是单纯好坏。", "比较形态、蛋白和功能证据。", "把动力学与自噬、凋亡接起来。"], ["mitophagy-flux"]),
  t("protein-homeostasis", "AKT–mTOR–FoxO 与蛋白稳态", "mTOR/FoxO", "muscle", 2, ["mTOR", "FoxO", "atrophy"], "说明合成、降解、自噬和再生怎样共同决定肌肉量。", ["区分 p70S6K、4E-BP1、MuRF1、atrogin-1。", "解释单一蛋白变化为何不等于通量。", "为代谢物干预配对功能终点。"], ["muscle-endpoints"]),
  t("fiber-csa", "肌纤维类型、CSA 与比力", "肌纤维/CSA", "muscle", 1, ["fiber type", "CSA", "force"], "从横截面积、纤维比例和 specific force 判断肌肉改变主要发生在哪里。", ["区分 I、IIa、IIx、IIb 的读出。", "拆开比例重排与每根纤维萎缩。", "解释 absolute force 受肌量影响。"], ["muscle-endpoints"]),
  t("satellite-cells", "卫星细胞、再生与肌核", "再生/卫星", "muscle", 2, ["Pax7", "regeneration", "myonuclei"], "区分再生能力、卫星细胞数量与成熟纤维功能。", ["梳理 Pax7、MyoD、myogenin 的序列。", "解释中央核不等于当前再生速度。", "把免疫浸润纳入设计。"], ["fiber-csa"]),
  t("disuse-model", "固定/失用模型的解释边界", "失用模型", "muscle", 2, ["HLI", "disuse", "contralateral"], "审查固定、HLI 和单侧模型是否把全身与局部效应拆开。", ["解释 contralateral limb 不是完美对照。", "区分固定时长、补偿活动与应激。", "分析供体/受体运动效应。"], ["muscle-endpoints"]),
  t("mito-ros", "线粒体 ROS 与氧化损伤", "ROS", "muscle", 2, ["ROS", "MitoSOX", "4-HNE"], "区分 ROS 作为信号和 ROS 造成损伤，并知道常见探针的限制。", ["比较 MitoSOX、4-HNE、carbonyl。", "说明抗氧化剂不能定位来源。", "给出 ROS–肌力功能读出。"], ["seahorse"]),
  t("cell-death", "调控性细胞死亡与肌少症", "细胞死亡", "muscle", 3, ["ferroptosis", "pyroptosis", "sarcopenia"], "区分凋亡、焦亡、铁死亡、坏死性凋亡和铜死亡的核心判据。", ["列出每种死亡方式的救援证据。", "识别只凭 marker 命名死亡的漏洞。", "画出线粒体损伤与死亡顺序。"], ["mitophagy-flux", "mito-ros"]),
  t("scrna-snrna", "scRNA 与 snRNA：何时选谁", "scRNA/snRNA", "omics", 1, ["scRNA", "snRNA", "muscle"], "为骨骼肌这类难解离组织选择单细胞或单核转录组，并预判偏倚。", ["比较细胞质 RNA 缺失与解离应激。", "解释肌纤维常用 snRNA。", "列出整合时的技术差异。"]),
  t("cellranger-qc", "Cell Ranger：单细胞 QC 报告", "Cell Ranger QC", "omics", 1, ["Cell Ranger", "UMI", "QC"], "从 QC report 判断细胞数、UMI、基因数、mapping 与饱和度是否异常。", ["解释 barcode rank plot。", "区分 reads per cell 与 library complexity。", "写出低质量样本排查顺序。"], ["scrna-snrna"]),
  t("seurat-integration", "Seurat 整合与批次效应", "Seurat 整合", "omics", 2, ["Seurat", "integration", "batch"], "判断整合是在去技术差异，还是不小心抹掉了真实生物差异。", ["区分 normalization、integration 和 DE。", "不要只看 UMAP 混合程度。", "应对组别与批次完全共线。"], ["cellranger-qc"]),
  t("cell-annotation", "细胞注释：marker 不是标签机", "细胞注释", "omics", 2, ["marker", "annotation", "doublet"], "用正向 marker、排除 marker 与组织位置共同给细胞群注释。", ["识别 doublet 和 stress signature。", "说明 marker 在不同状态可能失效。", "练习保守注释表述。"], ["cellranger-qc"]),
  t("singlecell-cleaning", "doublet、ambient RNA 与低质细胞", "单细胞清洗", "omics", 2, ["doublet", "ambient RNA", "QC"], "理解错误清洗会如何制造不存在的亚群或抹掉病理状态。", ["区分高 mitochondrial reads、低 UMI、doublet。", "理解环境 RNA 风险。", "按样本分布而非固定阈值设门槛。"], ["cellranger-qc"]),
  t("pseudotime", "轨迹分析：pseudotime 不是时间", "轨迹/拟时", "omics", 3, ["trajectory", "pseudotime"], "识别拟时序图能支持和不能支持的命题。", ["区分观测排序与真实时间。", "解释 root cell 选择。", "设计带时间点的再生验证。"], ["cell-annotation"]),
  t("cell-communication", "细胞通讯：配体–受体的证据", "细胞通讯", "omics", 3, ["ligand receptor", "cell communication"], "避免把配体–受体共表达直接写成已经发生细胞通讯。", ["区分数据库预测、空间邻近、功能阻断。", "排除细胞比例伪信号。", "为免疫—肌纤维互作设计验证。"], ["cell-annotation"]),
  t("spatial", "空间转录组：位置带来的因果线索", "空间转录组", "omics", 3, ["spatial", "deconvolution"], "判断空间表达图呈现的是细胞组成变化还是原位表达变化。", ["比较 spot 与单细胞分辨率。", "理解 deconvolution 假设。", "把空间邻近转为组织学验证。"], ["cell-annotation"]),
  t("multiomics", "多组学整合：同向、不同向与缺失", "多组学", "omics", 3, ["multiomics", "integration"], "把微生物、代谢组、转录组与肌肉终点放入一个分析计划而不滥用相关网络。", ["对齐样本、时间与平台批次。", "控制跨组学相关混杂。", "为代谢物—通路—表型设验证优先级。"], ["metagenomics", "lcms", "seurat-integration"]),
  t("geo-reanalysis", "GEO：复现一套肌肉转录组", "GEO 复现", "omics", 2, ["GEO", "reproducibility", "RNA-seq"], "从 GEO 找到矩阵、元数据和论文，并复现一张基础差异表达或 PCA 图。", ["检查样本数、年龄、组织部位、批次。", "区分 count、normalized matrix、FASTQ。", "记录参数使结果可审计。"], ["pca-plsda"]),
  t("animal-design", "动物实验：随机、盲法与笼位", "动物设计", "design", 1, ["randomization", "cage effect", "replicate"], "从方法部分判断是否存在伪重复、笼位混杂或选择性排除。", ["定义实验单位和技术重复。", "解释随机化、盲法减少的偏倚。", "列出菌群研究关键混杂。"]),
  t("effect-size", "样本量、效应量与置信区间", "效应量/CI", "design", 1, ["power", "effect size", "CI"], "把“P<0.05”升级为对效应大小、精确度和实际意义的判断。", ["区分 SD、SEM、95% CI。", "理解握力例子的 power。", "说明 n=3 能和不能支持什么。"]),
  t("mixed-model", "混合效应模型：重复与纵向数据", "混合效应", "design", 2, ["mixed model", "longitudinal"], "为重复测量、配对设计和多时间点数据选择合适随机效应。", ["区分固定效应、随机截距、随机斜率。", "解释不能把同一动物多次测量当独立样本。", "读懂 group×time interaction。"], ["effect-size"]),
  t("dag-mediation", "DAG、中介与因果链", "DAG/中介", "design", 2, ["DAG", "mediation", "confounding"], "用因果图区分混杂变量、中介变量和碰撞变量。", ["以饮食—菌群—代谢物—肌肉画 DAG。", "解释调整中介为何改变总效应。", "列出中介分析的强假设。"], ["fmt-causality"]),
  t("mendelian-randomization", "孟德尔随机化：工具变量的底线", "MR", "design", 3, ["MR", "instrument", "pleiotropy"], "判断一项 MR 是否满足 relevance、independence 和 exclusion restriction。", ["解释弱工具与 horizontal pleiotropy。", "区分 two-sample MR 与临床干预。", "为代谢物—肌肉写违反情形。"], ["gwas", "dag-mediation"]),
  t("human-confounding", "人体肠—肌研究的混杂地图", "人体混杂", "design", 2, ["human cohort", "confounding", "exercise"], "系统列出年龄、饮食、活动、药物、肾功能和肌肉状态如何共同影响关联。", ["设计最小协变量集。", "区分横断面、队列、干预。", "提出减少反向因果的时间设计。"], ["dag-mediation"]),
  t("c2c12", "C2C12 肌管：模型与陷阱", "C2C12", "wetlab", 1, ["C2C12", "myotube", "cell culture"], "判断 C2C12 分化、萎缩和代谢实验是否稳定可复现。", ["列出分化天数、血清切换、细胞密度。", "区分细胞死亡与真性肌管萎缩。", "为代谢物设置浓度和溶媒对照。"], ["muscle-endpoints"]),
  t("exposure-design", "代谢物暴露：剂量、时间和血药学", "暴露设计", "design", 2, ["dose", "physiology", "translation"], "避免用远超生理浓度的代谢物得到机制后直接外推。", ["比较肠腔、门静脉、外周血、组织浓度。", "区分 acute 与 chronic treatment。", "为一个体外浓度寻找生理合理性。"], ["exposure-clearance"]),
  t("evidence-chain", "主图证据链：从现象到机制", "证据链", "design", 2, ["paper reading", "evidence", "mechanism"], "逐 panel 判断论文是在证明关联、必要性、充分性还是临床相关性。", ["为每张主图写一句新增证据。", "识别相关网络被写成机制的跳步。", "找一个关键缺失对照。"], ["effect-size"]),
  t("sarcopenia", "肌少症临床定义与结局", "肌少症", "muscle", 1, ["sarcopenia", "clinical", "function"], "区分肌少症的肌量、肌力、躯体功能和临床不良结局。", ["比较握力、椅子起立、步速、DXA/CT。", "解释不同指南阈值不完全一致。", "匹配动物与人的可比终点。"], ["muscle-endpoints"]),
  t("exercise-microbiome", "运动—菌群—肌肉：三方因果拆解", "运动菌群", "design", 3, ["exercise", "microbiome", "causality"], "判断运动干预研究是否证明菌群介导，而非仅证明两者同步变化。", ["拆开训练、饮食、体成分和活动量。", "为 FMT/无菌验证写出必要性逻辑。", "定位代谢物与肌肉终点之间的缺口。"], ["fmt-causality", "human-confounding"]),
];

export const INITIAL_WHEEL_IDS = TOPICS.slice(0, 20).map((topic) => topic.id);

export const topicById = (id: string) => TOPICS.find((topic) => topic.id === id);
