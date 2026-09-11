# 将棋ラボ

ブラウザで遊べる個人制作の将棋ゲームです。

- 公開URL: https://pyonshira07.github.io/shogi-lab-link/
- AI対戦、友達とのブラウザ間対戦、詰将棋
- 登録不要、マウス／タッチ操作

友達対戦の接続にはPeerJS Cloudを利用し、対局データはWebRTCで参加者のブラウザ間を直接送ります。部屋を作った人が画面を閉じると、その部屋は終了します。

## ライセンス

- やねうら王WASM: [GPLv3](vendor/yaneuraou/LICENSE.md) / [対応ソース](https://github.com/mizar/YaneuraOu.wasm/tree/799183514172909f19ee975b81f025a2bc59bb8d)
- PeerJS: [MIT License](vendor/peerjs/LICENSE)
- coi-serviceworker: [MIT License](vendor/coi-serviceworker/LICENSE)
- 開始音声: VOICEVOX:No.7
