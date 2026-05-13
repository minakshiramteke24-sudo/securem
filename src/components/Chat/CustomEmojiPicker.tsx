import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, Smile, Heart, Coffee, Car, Lightbulb, Flag } from "lucide-react";

const EMOJI_CATEGORIES = [
  { name: "Smileys", icon: <Smile size={18} />, emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕"] },
  { name: "Love", icon: <Heart size={18} />, emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"] },
  { name: "Food", icon: <Coffee size={18} />, emojis: ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗", "🥘", "🫕", "🥣", "🥗", "🍿", "🧈", "🧂", "🍱", "🍘", "🍙", "🍚", "🍛", "🍜", "🍝", "🍠", "🍢", "🍣", "🍤", "🍥", "🥮", "🍡", "🥟", "🥠", "🥡", "🦀", "🦞", "🦐", "🦑", "🦪", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "🧁", "🥧", "🍫", "🍬", "🍭", "🍮", "🍯", "🍼", "🥛", "☕", "🫖", "🍵", "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤", "🧋", "🧃", "🧉", "🧊"] },
  { name: "Activity", icon: <Car size={18} />, emojis: ["⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤼", "🤸", "⛹️", "🤺", "🤾", "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚵", "🚴", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🏵️", "🎗️", "🎫", "🎟️", "🎭", "🎨", "🖼️", "🧵", "🪡", "🧶", "🪢"] },
  { name: "Objects", icon: <Lightbulb size={18} />, emojis: ["⌚", "📱", "📲", "💻", "⌨️", "🖱️", "🖨️", "🖱️", "🖲️", "🕹️", "🗜️", "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽️", "🎞️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "🧭", "⏱️", "⏲️", "⏰", "🕰️", "⌛", "⏳", "📡", "🔋", "🔌", "💡", "🔦", "🕯️", "🪔", "🧯", "🛢️", "💸", "💵", "💴", "💶", "💷", "🪙", "💰", "💳", "💎", "⚖️", "🪜", "🧰", "🪛", "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🪚", "🔩", "⚙️", "🪤", "🧱", "⛓️", "🧲", "🔫", "💣", "🧨", "🪓", "🔪", "🗡️", "⚔️", "🛡️", "🚬", "⚰️", "🪦", "⚱️", "🏺", "🔮", "📿", "🧿", "💈", "⚗️", "🔭", "🔬", "🕳️", "🩹", "🩺", "💊", "💉", "🩸", "🧬", "🌡️", "🧹", "🪠", "🧺", "🧻", "🧼", "🪥", "🧽", "🪣", "🧴", "🔑", "🗝️", "🚪", "🪑", "🛋️", "🛏️", "🧸", "🪟", "🖼️", "🪞", "🧺", "🧹", "🧴"] },
  { name: "Flags", icon: <Flag size={18} />, emojis: ["🏁", "🚩", "🎌", "🏴", "🏳️", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️"] }
];

interface CustomEmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

const CustomEmojiPicker: React.FC<CustomEmojiPickerProps> = ({ onEmojiSelect }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].name);

  const filteredResults = useMemo(() => {
    if (!searchTerm) return null;
    const results: string[] = [];
    EMOJI_CATEGORIES.forEach(cat => {
      cat.emojis.forEach(emoji => {
        results.push(emoji);
      });
    });
    return results.slice(0, 40); // Limit results for performance
  }, [searchTerm]);

  const handleCategoryClick = (name: string) => {
    setActiveCategory(name);
    const element = document.getElementById(`cat-${name}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="custom-emoji-picker glass animate-fade">
      <div className="emoji-search-container">
        <Search size={16} className="search-icon" />
        <input 
          type="text" 
          placeholder="Search emojis..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="emoji-body">
        <div className="emoji-scroll-area">
          {filteredResults ? (
            <div className="emoji-category-section">
              <h4 className="category-title">Search Results</h4>
              <div className="emoji-grid">
                {filteredResults.map((emoji, idx) => (
                  <motion.button
                    key={`search-${idx}`}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    className="emoji-btn"
                    onClick={() => onEmojiSelect(emoji)}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.name} id={`cat-${cat.name}`} className="emoji-category-section">
                <h4 className="category-title">{cat.name}</h4>
                <div className="emoji-grid">
                  {cat.emojis.map((emoji, idx) => (
                    <motion.button
                      key={`${cat.name}-${idx}`}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="emoji-btn"
                      onClick={() => onEmojiSelect(emoji)}
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="emoji-footer">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.name}
            className={`cat-nav-btn ${activeCategory === cat.name ? 'active' : ''}`}
            onClick={() => handleCategoryClick(cat.name)}
            title={cat.name}
          >
            {cat.icon}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CustomEmojiPicker;
