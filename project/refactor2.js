const fs = require("fs");
let chat = fs.readFileSync("app/(tabs)/chat.tsx", "utf8");

chat = chat.replace(
  "            </View>\n          </View>\n\n          <View style={styles.reactionButtons}>",
  "            </View>\n          </TouchableOpacity>\n\n          <View style={styles.reactionButtons}>"
);

chat = chat.replace(
  "                {!isRecording && (",
  `                {replyingTo && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f3f4', padding: 8, borderRadius: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: '#ff6b9d', fontWeight: 'bold' }}>Replying to {replyingTo.sender}</Text>
                      <Text style={{ fontSize: 14, color: '#666' }} numberOfLines={1}>{replyingTo.type === 'text' ? replyingTo.message : 'Media'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setReplyingTo(null)}>
                      <Text style={{ color: '#ff6b6b', fontWeight: 'bold', paddingHorizontal: 8 }}>X</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {editingMessage && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff3f8', padding: 8, borderRadius: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: '#ff6b9d', fontWeight: 'bold' }}>Editing message</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setEditingMessage(null); setInputText(''); }}>
                      <Text style={{ color: '#ff6b6b', fontWeight: 'bold', paddingHorizontal: 8 }}>X</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!isRecording && (`
);

chat = chat.replace(
  "        <View style={styles.inputWrapper}>",
  `        <View style={{ flexDirection: 'column', width: '100%' }}>
            <View style={styles.inputWrapper}>`
);
chat = chat.replace(
  "              </View>\n            </Animated.View>",
  "              </View>\n            </View>\n            </Animated.View>"
);

chat = chat.replace(
  "</SafeAreaView>",
  `{selectedMessage && (
        <Modal transparent animationType="fade" visible={!!selectedMessage} onRequestClose={() => setSelectedMessage(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setSelectedMessage(null)}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '80%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16 }}>
                {['??', '??', '??', '??', '??', '??'].map(emoji => (
                  <TouchableOpacity key={emoji} onPress={() => { addReaction(selectedMessage.id, emoji); setSelectedMessage(null); }} style={{ marginHorizontal: 8 }}>
                     <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 }}>
                <TouchableOpacity onPress={() => { setReplyingTo(selectedMessage); setSelectedMessage(null); }} style={{ paddingVertical: 12 }}><Text style={{ fontSize: 16 }}>?? Reply</Text></TouchableOpacity>
                <TouchableOpacity onPress={async () => { if (selectedMessage.message) await Clipboard.setStringAsync(selectedMessage.message); setSelectedMessage(null); }} style={{ paddingVertical: 12 }}><Text style={{ fontSize: 16 }}>?? Copy</Text></TouchableOpacity>
                {selectedMessage.sender === coupleData?.nickname && selectedMessage.type === 'text' && (
                  <TouchableOpacity onPress={() => { setEditingMessage(selectedMessage); setInputText(selectedMessage.message); setSelectedMessage(null); }} style={{ paddingVertical: 12 }}><Text style={{ fontSize: 16 }}>?? Edit</Text></TouchableOpacity>
                )}
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee' }}>
                  <Text style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
                    Status: {selectedMessage.timestamp ? 'Delivered' : 'Sending...'}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      </SafeAreaView>`
);

fs.writeFileSync("app/(tabs)/chat.tsx", chat, "utf8");
console.log("Patched 2!");
