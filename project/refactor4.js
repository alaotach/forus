const fs = require("fs");
let chat = fs.readFileSync("app/(tabs)/chat.tsx", "utf8");
chat = chat.replace(
  "                }) : ''}\n              </Text>\n            </View>\n          </View>\n\n                              <View style={styles.reactionButtons}>",
  "                }) : ''}\n              </Text>\n            </View>\n          </TouchableOpacity>\n\n                              <View style={styles.reactionButtons}>"
);
fs.writeFileSync("app/(tabs)/chat.tsx", chat, "utf8");
console.log("Refactored RenderMessage Close");
