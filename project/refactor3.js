const fs = require("fs");
let chat = fs.readFileSync("app/(tabs)/chat.tsx", "utf8");

chat = chat.replace(
  "  const [inputText, setInputText] = useState('');",
  "  const [inputText, setInputText] = useState('');\n  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);\n  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);\n  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);"
);

chat = chat.replace(
  "const sendMessage = async (messageText?: string, mediaUrl?: string, mediaType?: 'image' | 'audio') => {",
  `const sendMessage = async (messageText?: string, mediaUrl?: string, mediaType?: 'image' | 'audio') => {
    if (editingMessage) {
      const content = messageText || inputText.trim();
      if (!content || !coupleData) return;
      try {
        const msgRef = doc(db, 'couples', coupleData.coupleCode, 'chat', editingMessage.id);
        await updateDoc(msgRef, { message: content, edited: true });
        setEditingMessage(null);
        setInputText('');
      } catch (err) {
        console.error(err);
      }
      return;
    }`
);

chat = chat.replace(
  "timestamp: serverTimestamp(),\n          reactions: {},",
  `timestamp: serverTimestamp(),
          reactions: {},
          ...(replyingTo ? {
            replyTo: {
              id: replyingTo.id,
              sender: replyingTo.sender,
              message: replyingTo.type === 'text' ? replyingTo.message : 'Media'
            }
          } : {}),`
);

chat = chat.replace(
  "if (!mediaUrl) {\n          setInputText('');\n        }",
  "if (!mediaUrl) {\n          setInputText('');\n          setReplyingTo(null);\n        }"
);
fs.writeFileSync("app/(tabs)/chat.tsx", chat, "utf8");
console.log("Stage 1 injected.");
