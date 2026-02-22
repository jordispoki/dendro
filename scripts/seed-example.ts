import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const USER_ID = 'cmlvi938t0000s7qmhwon51n8'
const MODEL = 'google/gemini-2.0-flash'

async function main() {
  // ── Tree ──────────────────────────────────────────────────────────────────
  const tree = await prisma.tree.create({
    data: {
      userId: USER_ID,
      title: 'How does machine learning work?',
    },
  })

  // ── Root conversation ─────────────────────────────────────────────────────
  const root = await prisma.conversation.create({
    data: {
      treeId: tree.id,
      title: 'How does machine learning work?',
      model: MODEL,
      verbosity: 'detailed',
    },
  })

  // ── Root messages (10) ────────────────────────────────────────────────────
  const rootMsgs = await Promise.all([
    prisma.message.create({ data: { conversationId: root.id, role: 'user', content: 'How does machine learning work?' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'assistant', content: 'Machine learning works by exposing algorithms to large amounts of data and allowing them to learn patterns without being explicitly programmed. At its core, a model is a mathematical function with many adjustable parameters. During **training**, the model makes predictions on examples, compares them to the correct answers using a **loss function**, and then updates its parameters via **backpropagation** and **gradient descent** to reduce errors. Repeat this millions of times and the model learns to generalize.\n\nThere are three main paradigms:\n- **Supervised learning** – labeled input/output pairs\n- **Unsupervised learning** – finding structure in unlabeled data\n- **Reinforcement learning** – learning via reward signals' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'user', content: 'What is a neural network exactly?' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'assistant', content: 'A **neural network** is a computational model loosely inspired by biological neurons. It consists of layers of **nodes** (neurons), each connected to the next layer with weighted edges.\n\n- **Input layer** – receives raw features (pixels, tokens, numbers…)\n- **Hidden layers** – apply non-linear transformations (ReLU, GELU, etc.)\n- **Output layer** – produces predictions or class probabilities\n\nEach neuron computes a weighted sum of its inputs, adds a bias, then passes the result through an **activation function** to introduce non-linearity. Without non-linearity, a deep network would collapse to a single linear transformation and lose all expressive power.' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'user', content: 'How does training actually update the weights?' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'assistant', content: 'Training follows this loop:\n\n1. **Forward pass** – feed a batch of inputs through the network to get predictions\n2. **Loss computation** – measure the error (e.g. cross-entropy for classification)\n3. **Backward pass (backpropagation)** – compute the gradient of the loss with respect to every weight using the chain rule\n4. **Gradient descent step** – subtract a small fraction (the *learning rate*) of each gradient from its weight: `w ← w − lr · ∂L/∂w`\n\nModern optimizers like **Adam** maintain running estimates of gradient moments to adapt the learning rate per parameter, which dramatically speeds up convergence.' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'user', content: 'What is the difference between CNNs and RNNs?' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'assistant', content: '**CNNs (Convolutional Neural Networks)** are designed for grid-structured data like images. They use *convolutional filters* that slide across the input, sharing weights across spatial positions. This gives them **translation invariance** and makes them far more parameter-efficient than fully-connected layers for images.\n\n**RNNs (Recurrent Neural Networks)** are designed for sequential data. They maintain a *hidden state* that gets updated at each time step, allowing information to persist across a sequence. However, vanilla RNNs struggle with long-range dependencies due to vanishing gradients — which is why **LSTMs** and **GRUs** were developed.\n\nToday, **Transformers** have largely replaced RNNs for sequences because they handle long-range dependencies much better through attention.' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'user', content: 'Where do transformers fit in?' } }),
    prisma.message.create({ data: { conversationId: root.id, role: 'assistant', content: '**Transformers**, introduced in "Attention Is All You Need" (2017), revolutionized the field. Instead of processing sequences step-by-step like RNNs, they process all tokens in **parallel** using a mechanism called **self-attention**.\n\nSelf-attention lets every token in the input *attend to* every other token, learning contextual relationships. This enables:\n- Much better capture of long-range dependencies\n- Efficient training on GPUs/TPUs (parallelism)\n- Scaling to billions of parameters\n\nVirtually every frontier model today — GPT-4, Gemini, Claude — is a Transformer variant. They\'ve also proven effective beyond NLP: vision (ViT), audio, protein folding (AlphaFold), and more.' } }),
  ])

  const [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10] = rootMsgs

  // ── Branch 1: Backpropagation deep dive (from m4 – "neural network" assistant reply) ──
  const backpropSummary = 'Discussion covers how ML works via training on data with loss functions, and an explanation of neural networks as layered weighted computation graphs with activation functions.'

  const branchBackprop = await prisma.conversation.create({
    data: {
      treeId: tree.id,
      parentId: root.id,
      title: 'Backpropagation in depth',
      model: MODEL,
      verbosity: 'detailed',
      branchText: 'loosely inspired by biological neurons',
      branchMessageId: m4.id,
      branchSummary: backpropSummary,
    },
  })

  const bpMsgs = await Promise.all([
    prisma.message.create({ data: { conversationId: branchBackprop.id, role: 'user', content: 'Can you go deeper on backpropagation? How does the chain rule apply here?' } }),
    prisma.message.create({ data: { conversationId: branchBackprop.id, role: 'assistant', content: 'Backpropagation is just the **chain rule of calculus** applied recursively across the network.\n\nIf the loss `L` depends on weight `w` through intermediate computations, we need `∂L/∂w`. For a two-layer example:\n\n```\n∂L/∂w₁ = (∂L/∂a₂) · (∂a₂/∂z₂) · (∂z₂/∂a₁) · (∂a₁/∂z₁) · (∂z₁/∂w₁)\n```\n\nEach term is a local gradient that can be computed cheaply. Modern frameworks like PyTorch build a **computation graph** on the forward pass and then traverse it in reverse to accumulate gradients automatically — this is called **autograd**.' } }),
    prisma.message.create({ data: { conversationId: branchBackprop.id, role: 'user', content: 'What causes the vanishing gradient problem?' } }),
    prisma.message.create({ data: { conversationId: branchBackprop.id, role: 'assistant', content: 'The vanishing gradient problem arises when gradients shrink exponentially as they propagate back through many layers.\n\nWith activation functions like **sigmoid** or **tanh**, the derivatives are always < 1 (sigmoid peaks at 0.25). Multiply many such small numbers together through dozens of layers and the gradient approaches zero — early layers essentially stop learning.\n\n**Solutions:**\n- **ReLU activations** – derivative is exactly 1 for positive inputs\n- **Residual connections (ResNets)** – skip connections provide a gradient highway\n- **Batch normalization** – keeps activations in a healthy range\n- **Careful weight initialization** – Xavier/He init keeps variance stable' } }),
  ])

  const [bp1, bp2, bp3, bp4] = bpMsgs

  // ── Branch 1.1: Gradient descent variants (from bp2 – backprop explanation) ──
  const branchGD = await prisma.conversation.create({
    data: {
      treeId: tree.id,
      parentId: branchBackprop.id,
      title: 'Gradient descent variants',
      model: MODEL,
      verbosity: 'normal',
      branchText: 'Modern frameworks like PyTorch build a computation graph',
      branchMessageId: bp2.id,
      branchSummary: 'Explored backpropagation using the chain rule and how autograd frameworks compute gradients automatically.',
    },
  })

  await Promise.all([
    prisma.message.create({ data: { conversationId: branchGD.id, role: 'user', content: 'What are the main variants of gradient descent and when should I use each?' } }),
    prisma.message.create({ data: { conversationId: branchGD.id, role: 'assistant', content: '**Batch GD** – uses the full dataset per step. Very stable but slow and memory-intensive.\n\n**Stochastic GD (SGD)** – one random example per step. Fast and noisy, which can actually help escape local minima.\n\n**Mini-batch GD** – the practical default. Balances speed and stability, works well with GPU parallelism (typical batch size: 32–512).\n\n**Adam** – adaptive learning rates using first and second moment estimates. Great default for most tasks.\n\n**AdamW** – Adam with decoupled weight decay. Preferred for training LLMs.\n\nFor most deep learning projects, start with **AdamW** with a cosine learning rate schedule.' } }),
    prisma.message.create({ data: { conversationId: branchGD.id, role: 'user', content: 'What learning rate should I pick?' } }),
    prisma.message.create({ data: { conversationId: branchGD.id, role: 'assistant', content: 'Learning rate is the most important hyperparameter. Too high → divergence; too low → very slow convergence.\n\n**Practical approach:**\n1. **LR range test** – sweep from 1e-7 to 10, plot loss vs LR, pick just before loss explodes\n2. Typical starting values: `1e-3` for Adam, `0.01–0.1` for SGD\n3. Use a **scheduler**: cosine annealing or OneCycleLR are popular\n4. **Warmup** first N steps from near-zero (critical for Transformers)\n\nModern practice: use a small grid search around `{1e-4, 3e-4, 1e-3}` and watch the training curve.' } }),
  ])

  // ── Branch 2: CNNs vs fully connected (from m8 – CNN/RNN answer) ──
  const branchCNN = await prisma.conversation.create({
    data: {
      treeId: tree.id,
      parentId: root.id,
      title: 'How convolutions work',
      model: MODEL,
      verbosity: 'normal',
      branchText: 'convolutional filters that slide across the input',
      branchMessageId: m8.id,
      branchSummary: 'Covered supervised/unsupervised/RL paradigms, neural net fundamentals, training loops with gradient descent, and the difference between CNNs (spatial, weight-sharing) and RNNs (sequential, hidden state).',
    },
  })

  await Promise.all([
    prisma.message.create({ data: { conversationId: branchCNN.id, role: 'user', content: 'How exactly does a convolutional filter work? What makes it different from a dense layer?' } }),
    prisma.message.create({ data: { conversationId: branchCNN.id, role: 'assistant', content: 'A **convolutional filter** (kernel) is a small weight matrix — say 3×3 — that slides across the input image with a fixed **stride**. At each position it computes a dot product between the kernel weights and the overlapping patch of pixels, producing one value in the **feature map**.\n\nKey differences from dense layers:\n- **Weight sharing** – the same kernel is reused at every position (millions fewer parameters)\n- **Local connectivity** – each output only depends on a small receptive field\n- **Translation equivariance** – a cat in the top-left and a cat in the bottom-right activate the same filter\n\nEarly filters learn edges and colors; deeper filters learn textures, parts, and eventually object concepts.' } }),
    prisma.message.create({ data: { conversationId: branchCNN.id, role: 'user', content: 'What is pooling and why is it used?' } }),
    prisma.message.create({ data: { conversationId: branchCNN.id, role: 'assistant', content: '**Pooling** downsamples feature maps to reduce spatial dimensions, memory usage, and computation.\n\n**Max pooling** (most common) takes the maximum value in each pooling window (e.g. 2×2 with stride 2 → halves width and height). It retains the strongest activation in each region.\n\n**Average pooling** takes the mean instead — used in some architectures for final aggregation before the classifier.\n\n**Why it helps:**\n- Builds **translation invariance** (a feature slightly shifted still fires)\n- Progressively increases the receptive field\n- Reduces overfitting by discarding exact spatial info\n\nModern architectures (ResNets, EfficientNets) sometimes replace pooling with strided convolutions for more learnable downsampling.' } }),
  ])

  // ── Branch 3: Attention mechanism (from m10 – transformers answer) ──
  const branchAttn = await prisma.conversation.create({
    data: {
      treeId: tree.id,
      parentId: root.id,
      title: 'Self-attention mechanism',
      model: MODEL,
      verbosity: 'detailed',
      branchText: 'self-attention',
      branchMessageId: m10.id,
      branchSummary: 'Full conversation on ML fundamentals: training loops, neural nets, gradient descent, CNNs vs RNNs, and the rise of Transformers as the dominant architecture.',
    },
  })

  const attnMsgs = await Promise.all([
    prisma.message.create({ data: { conversationId: branchAttn.id, role: 'user', content: 'Explain the self-attention mechanism step by step.' } }),
    prisma.message.create({ data: { conversationId: branchAttn.id, role: 'assistant', content: 'For each token in the sequence, self-attention computes three vectors:\n- **Q (Query)** – "what am I looking for?"\n- **K (Key)** – "what do I contain?"\n- **V (Value)** – "what will I contribute?"\n\nThese are linear projections of the input embedding.\n\n**Step by step:**\n1. Compute attention scores: `scores = Q · Kᵀ / √d_k`\n2. Apply softmax to get weights that sum to 1\n3. Weighted sum of values: `output = softmax(scores) · V`\n\nThis gives every token a context-aware representation that blends information from the entire sequence, weighted by relevance. **Multi-head attention** runs this in parallel with multiple projection matrices, then concatenates the results.' } }),
    prisma.message.create({ data: { conversationId: branchAttn.id, role: 'user', content: 'Why divide by √d_k?' } }),
    prisma.message.create({ data: { conversationId: branchAttn.id, role: 'assistant', content: 'Without the scaling factor, the dot products `Q · Kᵀ` can grow very large in magnitude as the dimension `d_k` increases.\n\nWhen you feed large values into softmax, the gradient becomes extremely small (the distribution becomes nearly one-hot). This is the **softmax saturation** problem — training slows dramatically because gradients vanish.\n\nDividing by `√d_k` keeps the variance of the dot products roughly constant regardless of embedding dimension, maintaining healthy gradients throughout training.\n\nIntuitively: if Q and K are random vectors with unit variance, their dot product has variance `d_k`. Dividing by `√d_k` normalizes it back to unit variance.' } }),
    prisma.message.create({ data: { conversationId: branchAttn.id, role: 'user', content: 'What is positional encoding and why do Transformers need it?' } }),
    prisma.message.create({ data: { conversationId: branchAttn.id, role: 'assistant', content: 'Self-attention treats its inputs as a **set** — it has no inherent sense of order. Feed it "dog bites man" vs "man bites dog" and without extra information it would produce identical representations.\n\n**Positional encoding** adds position information to each token embedding before feeding it into the Transformer.\n\n**Sinusoidal (original):** adds fixed sine/cosine waves of different frequencies:\n```\nPE(pos, 2i)   = sin(pos / 10000^(2i/d))\nPE(pos, 2i+1) = cos(pos / 10000^(2i/d))\n```\n\n**Learned absolute positions** – a trainable embedding table (used in BERT, GPT).\n\n**RoPE (Rotary Position Embedding)** – rotates Q/K vectors based on position before the attention dot product. Used in LLaMA, Gemini, and most modern LLMs. Excellent extrapolation to longer sequences.' } }),
  ])

  const [a1, a2, a3, a4, a5, a6] = attnMsgs

  // ── Branch 3.1: How BERT works (from a2 – attention steps answer) ──
  const branchBERT = await prisma.conversation.create({
    data: {
      treeId: tree.id,
      parentId: branchAttn.id,
      title: 'BERT vs GPT architecture',
      model: MODEL,
      verbosity: 'normal',
      branchText: 'Multi-head attention',
      branchMessageId: a2.id,
      branchSummary: 'Explained the self-attention mechanism in detail: Q/K/V projections, scaled dot-product attention formula, multi-head attention.',
    },
  })

  await Promise.all([
    prisma.message.create({ data: { conversationId: branchBERT.id, role: 'user', content: 'What is the difference between BERT and GPT architecturally?' } }),
    prisma.message.create({ data: { conversationId: branchBERT.id, role: 'assistant', content: 'Both are Transformer-based but differ in which part of the architecture they use and how they\'re trained.\n\n**BERT (encoder-only):**\n- Uses bidirectional self-attention — every token attends to all others (left and right)\n- Pre-trained with Masked Language Modeling (MLM): randomly mask tokens, predict them\n- Great for **understanding** tasks: classification, NER, QA, embeddings\n\n**GPT (decoder-only):**\n- Uses **causal** (masked) self-attention — each token only attends to previous tokens\n- Pre-trained with next-token prediction (autoregressive language modeling)\n- Great for **generation** tasks: text completion, chat, code\n\n**Encoder-decoder (T5, BART):**\n- Full Transformer: encoder reads input bidirectionally, decoder generates output causally\n- Good for seq2seq tasks: translation, summarization\n\nModern frontier models (GPT-4, Claude, Gemini) are all decoder-only at scale.' } }),
    prisma.message.create({ data: { conversationId: branchBERT.id, role: 'user', content: 'Why did decoder-only win out for large models?' } }),
    prisma.message.create({ data: { conversationId: branchBERT.id, role: 'assistant', content: 'Several reasons converged:\n\n1. **Simpler architecture** – one stack instead of two (encoder + decoder), easier to scale uniformly\n2. **Next-token prediction scales better** – the pretraining signal is extremely dense (every token is a prediction target) and the task gets harder as the model grows, providing endless learning signal\n3. **In-context learning emerges** – large causal models learned to follow instructions and few-shot examples without fine-tuning, which wasn\'t as strong in encoder models\n4. **RLHF alignment** – easier to apply reinforcement learning from human feedback to a generative model\n\nBERT-style encoders are still heavily used for retrieval, embeddings, and classification — they\'re more efficient when you don\'t need generation.' } }),
  ])

  console.log(`✅ Created tree "${tree.title}" (${tree.id})`)
  console.log(`   Root: ${root.id} (${rootMsgs.length} messages)`)
  console.log(`   Branch: Backpropagation (${bpMsgs.length} messages)`)
  console.log(`     Sub-branch: Gradient descent (4 messages)`)
  console.log(`   Branch: How convolutions work (4 messages)`)
  console.log(`   Branch: Self-attention mechanism (${attnMsgs.length} messages)`)
  console.log(`     Sub-branch: BERT vs GPT (4 messages)`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
