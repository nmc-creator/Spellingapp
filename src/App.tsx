import React, { useState, useEffect, useRef } from "react";
import {
  Home,
  ArrowLeft,
  Trash2,
  Volume2,
  Plus,
  Play,
  Check,
  X,
  BookOpen,
  Save,
  Edit2,
  User,
  Loader2,
} from "lucide-react";

// --- Assets & Constants ---

// Simple Base64 Sound Effects to ensure the app works without external assets
const SOUNDS = {
  correct:
    "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVWo6y6yI5lOTKVs73DkG8+NKK3w8KSdEEzoLfDwZF2QzOgt8PBkXZDM6C3w8GRdkMzoLfDwZF2QzOgt8PBkXZDM6C3w8GRdkMzAACBPw==",
  wrong:
    "data:audio/wav;base64,UklGRi4AAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQcAAAA0AAA0AAA0AAA0AAA0AAA0AA==",
};

// Mock Dictionary for Demo Purposes (Fallbacks)
const MOCK_DB = {
  government: {
    def: "政府",
    pos: "noun",
    sentence: "The government announced new policies today.",
  },
  environment: {
    def: "環境",
    pos: "noun",
    sentence: "We must protect our environment.",
  },
  beautiful: {
    def: "美麗的",
    pos: "adjective",
    sentence: "Hong Kong is a beautiful city at night.",
  },
  student: {
    def: "學生",
    pos: "noun",
    sentence: "Every student must wear a uniform.",
  },
};

const SpellingApp = () => {
  // --- State ---
  const [view, setView] = useState("home"); // home, list, practice
  const [lists, setLists] = useState(() => {
    const saved = localStorage.getItem("hk_spelling_lists");
    return saved ? JSON.parse(saved) : [];
  });

  const [studentInfo, setStudentInfo] = useState(() => {
    const saved = localStorage.getItem("hk_spelling_profile");
    return saved ? JSON.parse(saved) : { name: "", sClass: "", classNum: "" };
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [activeListId, setActiveListId] = useState(null);

  // Practice Mode State
  const [practiceSession, setPracticeSession] = useState({
    queue: [],
    currentIndex: 0,
    round: 1,
    mistakesRound1: [],
    retryQueue: [],
    currentWord: null,
    userInput: "",
    feedback: null,
    score: 0,
    totalWords: 0,
  });

  // UI State
  const [newListTitle, setNewListTitle] = useState("");
  const [newWordInput, setNewWordInput] = useState("");
  const [isFetching, setIsFetching] = useState(false); // New loading state

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem("hk_spelling_lists", JSON.stringify(lists));
  }, [lists]);

  useEffect(() => {
    localStorage.setItem("hk_spelling_profile", JSON.stringify(studentInfo));
  }, [studentInfo]);

  useEffect(() => {
    if (!studentInfo.name) {
      setIsEditingProfile(true);
    }
  }, []);

  // --- Helpers ---
  const playSound = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "correct") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  const speak = (text) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.85;
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.name.includes("Google US English") || v.name.includes("Samantha")
      );
      if (preferredVoice) utterance.voice = preferredVoice;
      window.speechSynthesis.speak(utterance);
    }
  };

  const shuffleArray = (array) => {
    let newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  };

  // --- Actions ---

  const handleUpdateProfile = (field, value) => {
    setStudentInfo((prev) => ({ ...prev, [field]: value }));
  };

  const saveProfile = () => {
    if (studentInfo.name.trim()) {
      setIsEditingProfile(false);
    }
  };

  const handleCreateList = () => {
    if (!newListTitle.trim()) return;
    const newList = {
      id: Date.now(),
      title: newListTitle,
      words: [],
      mastery: { correct: 0, total: 0 },
    };
    setLists([...lists, newList]);
    setNewListTitle("");
  };

  const handleDeleteList = (e, id) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this list?")) {
      setLists(lists.filter((l) => l.id !== id));
    }
  };

  // --- UPDATED: Async Word Addition ---
  const handleAddWord = async (listId) => {
    if (!newWordInput.trim()) return;

    setIsFetching(true); // Start loading
    const term = newWordInput.trim().toLowerCase();

    // Default placeholders
    let definition = "請輸入中文解釋";
    let pos = "n./v.";
    let sentence = `Please add a sentence for '${term}'.`;

    // 1. Check local Mock DB first (fastest)
    if (MOCK_DB[term]) {
      definition = MOCK_DB[term].def;
      pos = MOCK_DB[term].pos;
      sentence = MOCK_DB[term].sentence;
    } else {
      // 2. Try External APIs
      try {
        // A. Fetch English Info (POS + Sentence) from DictionaryAPI
        const dictRes = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${term}`
        );
        if (dictRes.ok) {
          const dictData = await dictRes.json();
          const firstEntry = dictData[0];

          if (
            firstEntry &&
            firstEntry.meanings &&
            firstEntry.meanings.length > 0
          ) {
            const firstMeaning = firstEntry.meanings[0];
            pos = firstMeaning.partOfSpeech;

            // Try to find a definition with an example
            for (let m of firstEntry.meanings) {
              const defWithExample = m.definitions.find((d) => d.example);
              if (defWithExample) {
                sentence = defWithExample.example;
                break;
              }
            }
          }
        }

        // B. Fetch Chinese Translation from MyMemory (Free Tier)
        const transRes = await fetch(
          `https://api.mymemory.translated.net/get?q=${term}&langpair=en|zh-HK`
        );
        if (transRes.ok) {
          const transData = await transRes.json();
          if (transData.responseData && transData.responseData.translatedText) {
            // Basic cleaning of result
            definition = transData.responseData.translatedText;
          }
        }
      } catch (error) {
        console.log("Auto-fill failed, using placeholders", error);
      }
    }

    const newWord = {
      id: Date.now(),
      text: term,
      definition: definition,
      pos: pos,
      sentence: sentence,
      isEditing: false,
    };

    const updatedLists = lists.map((list) => {
      if (list.id === listId) {
        return { ...list, words: [...list.words, newWord] };
      }
      return list;
    });

    setLists(updatedLists);
    setNewWordInput("");
    setIsFetching(false); // Stop loading
  };

  const handleDeleteWord = (listId, wordId) => {
    setLists(
      lists.map((list) => {
        if (list.id === listId) {
          return { ...list, words: list.words.filter((w) => w.id !== wordId) };
        }
        return list;
      })
    );
  };

  const handleUpdateWordDetails = (listId, wordId, field, value) => {
    setLists(
      lists.map((list) => {
        if (list.id === listId) {
          const updatedWords = list.words.map((w) => {
            if (w.id === wordId) return { ...w, [field]: value };
            return w;
          });
          return { ...list, words: updatedWords };
        }
        return list;
      })
    );
  };

  const startPractice = () => {
    const activeList = lists.find((l) => l.id === activeListId);
    if (!activeList || activeList.words.length === 0) return;

    const shuffled = shuffleArray(activeList.words);

    setPracticeSession({
      queue: shuffled,
      currentIndex: 0,
      round: 1,
      mistakesRound1: [],
      retryQueue: [],
      currentWord: shuffled[0],
      userInput: "",
      feedback: null,
      score: 0,
      totalWords: shuffled.length,
    });

    setView("practice");
    setTimeout(() => speak(shuffled[0].text), 500);
  };

  const handlePracticeSubmit = (e) => {
    e.preventDefault();
    if (practiceSession.feedback) return;

    const isCorrect =
      practiceSession.userInput.trim().toLowerCase() ===
      practiceSession.currentWord.text.toLowerCase();

    if (isCorrect) {
      playSound("correct");
      setPracticeSession((prev) => ({ ...prev, feedback: "correct" }));
    } else {
      playSound("wrong");
      setPracticeSession((prev) => ({ ...prev, feedback: "incorrect" }));
    }

    setTimeout(
      () => {
        nextPracticeWord(isCorrect);
      },
      isCorrect ? 1500 : 3000
    );
  };

  const nextPracticeWord = (wasCorrect) => {
    setPracticeSession((prev) => {
      const {
        queue,
        currentIndex,
        round,
        mistakesRound1,
        retryQueue,
        currentWord,
      } = prev;

      let newMistakesRound1 = [...mistakesRound1];
      let newRetryQueue = [...retryQueue];
      let newScore = prev.score;

      if (!wasCorrect) {
        if (round === 1) newMistakesRound1.push(currentWord.id);
        newRetryQueue.push(currentWord);
      } else {
        if (round === 1) newScore += 1;
      }

      if (currentIndex + 1 < queue.length) {
        const nextWord = queue[currentIndex + 1];
        speak(nextWord.text);
        return {
          ...prev,
          currentIndex: currentIndex + 1,
          mistakesRound1: newMistakesRound1,
          retryQueue: newRetryQueue,
          currentWord: nextWord,
          userInput: "",
          feedback: null,
          score: newScore,
        };
      } else {
        if (round === 1 && newRetryQueue.length > 0) {
          const nextQueue = shuffleArray(newRetryQueue);
          setTimeout(() => {
            alert("Round 1 Complete! Now retrying the words you missed.");
            speak(nextQueue[0].text);
          }, 100);

          return {
            ...prev,
            round: 2,
            queue: nextQueue,
            currentIndex: 0,
            retryQueue: [],
            mistakesRound1: newMistakesRound1,
            currentWord: nextQueue[0],
            userInput: "",
            feedback: null,
            score: newScore,
          };
        }

        finishPractice(prev.totalWords, newScore);
        return prev;
      }
    });
  };

  const finishPractice = (total, correct) => {
    setLists(
      lists.map((l) => {
        if (l.id === activeListId) {
          return { ...l, mastery: { correct, total } };
        }
        return l;
      })
    );
    setView("home");
  };

  // --- Renderers ---

  const Header = ({ title, showBack = false, showHome = false }) => (
    <div className="bg-indigo-600 text-white p-4 shadow-md flex justify-between items-center sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => setView("home")}
            className="hover:bg-indigo-700 p-2 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
        )}
        <h1 className="text-xl font-bold truncate max-w-[200px] sm:max-w-md">
          {title}
        </h1>
      </div>
      {showHome && (
        <button
          onClick={() => setView("home")}
          className="hover:bg-indigo-700 p-2 rounded-full transition-colors flex items-center gap-1"
        >
          <Home size={24} />
          <span className="hidden sm:inline text-sm font-medium">Home</span>
        </button>
      )}
    </div>
  );

  const renderProfileCard = () => {
    return (
      <div className="bg-white rounded-xl shadow-md border-l-4 border-indigo-500 p-4 mb-6 transition-all">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-lg">
            <User size={20} />
            <h2>Student Profile</h2>
          </div>
          <button
            onClick={() => setIsEditingProfile(!isEditingProfile)}
            className="text-slate-400 hover:text-indigo-600 p-1 rounded transition-colors"
          >
            {isEditingProfile ? <X size={20} /> : <Edit2 size={18} />}
          </button>
        </div>

        {isEditingProfile ? (
          <div className="space-y-3 animate-in fade-in duration-300">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Name
              </label>
              <input
                type="text"
                value={studentInfo.name}
                onChange={(e) => handleUpdateProfile("name", e.target.value)}
                placeholder="Enter Student Name"
                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-200 outline-none"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Class
                </label>
                <input
                  type="text"
                  value={studentInfo.sClass}
                  onChange={(e) =>
                    handleUpdateProfile("sClass", e.target.value)
                  }
                  placeholder="e.g. 3A"
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Class No.
                </label>
                <input
                  type="text"
                  value={studentInfo.classNum}
                  onChange={(e) =>
                    handleUpdateProfile("classNum", e.target.value)
                  }
                  placeholder="#"
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
            </div>
            <button
              onClick={saveProfile}
              className="w-full bg-indigo-600 text-white py-2 rounded font-medium hover:bg-indigo-700 mt-2 flex justify-center items-center gap-2"
            >
              <Save size={16} /> Save Profile
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            {studentInfo.name ? (
              <>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-slate-800">
                    {studentInfo.name}
                  </p>
                </div>
                <div className="flex gap-4 text-sm bg-slate-100 p-2 rounded-lg text-slate-600">
                  <div>
                    <span className="block text-xs font-bold text-slate-400">
                      CLASS
                    </span>
                    <span className="font-mono font-bold text-slate-800 text-lg">
                      {studentInfo.sClass || "-"}
                    </span>
                  </div>
                  <div className="w-px bg-slate-300"></div>
                  <div>
                    <span className="block text-xs font-bold text-slate-400">
                      NO.
                    </span>
                    <span className="font-mono font-bold text-slate-800 text-lg">
                      {studentInfo.classNum || "-"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div
                className="text-slate-500 italic flex items-center gap-2 cursor-pointer"
                onClick={() => setIsEditingProfile(true)}
              >
                Click edit to set your name and class info.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderHome = () => (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-indigo-600 text-white p-6 shadow-md text-center">
        <h1 className="text-3xl font-bold mb-2">My Vocabulary Lists</h1>
        <p className="text-indigo-100">
          Hong Kong Secondary School Spelling App
        </p>
      </div>

      <div className="max-w-md mx-auto p-4 mt-6">
        {renderProfileCard()}

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Create New List
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              placeholder="e.g., Chapter 1 Dictation"
              className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleCreateList}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {lists.length === 0 && (
            <div className="text-center text-slate-400 py-10">
              <BookOpen size={48} className="mx-auto mb-2 opacity-50" />
              <p>No lists yet. Create one to start!</p>
            </div>
          )}

          {lists.map((list) => (
            <div
              key={list.id}
              onClick={() => {
                setActiveListId(list.id);
                setView("list");
              }}
              className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer flex justify-between items-center group"
            >
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {list.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded">
                    {list.words.length} Words
                  </span>
                  {list.mastery.total > 0 && (
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        list.mastery.correct / list.mastery.total > 0.8
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      Mastery: {list.mastery.correct}/{list.mastery.total}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteList(e, list.id)}
                className="text-slate-300 hover:text-red-500 p-2 transition-colors"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderVocabList = () => {
    const activeList = lists.find((l) => l.id === activeListId);
    if (!activeList) return null;

    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <Header title={activeList.title} showBack showHome />

        <div className="max-w-2xl mx-auto p-4">
          {/* Add Word Section */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={newWordInput}
                onChange={(e) => setNewWordInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  !isFetching &&
                  handleAddWord(activeList.id)
                }
                placeholder="Add new word (e.g. environment)"
                disabled={isFetching}
                className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
              />
              <button
                onClick={() => handleAddWord(activeList.id)}
                disabled={isFetching}
                className={`text-white px-6 rounded-lg font-medium flex items-center gap-2 min-w-[100px] justify-center ${
                  isFetching
                    ? "bg-indigo-400 cursor-wait"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {isFetching ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  "Add"
                )}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">
              *Searching online dictionaries for definitions...
            </p>
          </div>

          {/* List Display */}
          <div className="space-y-4">
            {activeList.words.length === 0 ? (
              <p className="text-center text-slate-500 py-10">
                List is empty. Add words to begin.
              </p>
            ) : (
              activeList.words.map((word) => (
                <div
                  key={word.id}
                  className="bg-white p-4 rounded-xl shadow-sm border border-slate-200"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-slate-800">
                        {word.text}
                      </h3>
                      <button
                        onClick={() => speak(word.text)}
                        className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-full"
                      >
                        <Volume2 size={20} />
                      </button>
                    </div>
                    <button
                      onClick={() => handleDeleteWord(activeList.id, word.id)}
                      className="text-slate-300 hover:text-red-500 p-1"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Editable Fields */}
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">
                        POS
                      </span>
                      <input
                        className="text-sm text-slate-600 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-20"
                        value={word.pos}
                        onChange={(e) =>
                          handleUpdateWordDetails(
                            activeList.id,
                            word.id,
                            "pos",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        DEF
                      </span>
                      <input
                        className="text-base text-slate-800 font-medium border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none flex-1"
                        value={word.definition}
                        onChange={(e) =>
                          handleUpdateWordDetails(
                            activeList.id,
                            word.id,
                            "definition",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div className="bg-slate-50 p-2 rounded text-sm text-slate-600 italic">
                      <input
                        className="w-full bg-transparent border-none outline-none italic"
                        value={word.sentence}
                        onChange={(e) =>
                          handleUpdateWordDetails(
                            activeList.id,
                            word.id,
                            "sentence",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Floating Practice Button */}
        {activeList.words.length > 0 && (
          <div className="fixed bottom-6 left-0 right-0 px-4 flex justify-center">
            <button
              onClick={startPractice}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full shadow-lg flex items-center gap-2 transform transition-transform hover:scale-105"
            >
              <Play size={20} fill="currentColor" />
              Start Practice
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderPractice = () => {
    const { currentWord, userInput, feedback, round, queue, currentIndex } =
      practiceSession;

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header
          title={`Practice Mode (${
            round === 2 ? "Retry Mistakes" : "Round 1"
          })`}
          showHome
        />

        {/* Progress Bar */}
        <div className="w-full bg-slate-200 h-2">
          <div
            className="bg-indigo-500 h-2 transition-all duration-300"
            style={{ width: `${(currentIndex / queue.length) * 100}%` }}
          />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
          {/* Card */}
          <div className="bg-white p-8 rounded-2xl shadow-lg w-full text-center relative overflow-hidden">
            {feedback === "correct" && (
              <div className="absolute inset-0 bg-green-100 flex items-center justify-center bg-opacity-90 z-20">
                <div className="text-green-600 transform scale-150">
                  <Check size={64} />
                  <p className="text-lg font-bold mt-2">Correct!</p>
                </div>
              </div>
            )}

            {feedback === "incorrect" && (
              <div className="absolute inset-0 bg-red-50 flex flex-col items-center justify-center bg-opacity-95 z-20 p-4">
                <div className="text-red-500 mb-2">
                  <X size={48} />
                </div>
                <p className="text-slate-500 text-sm mb-1">Correct spelling:</p>
                <p className="text-2xl font-bold text-slate-800 mb-4 tracking-wide">
                  {currentWord.text}
                </p>
                <p className="text-slate-600 text-sm animate-pulse">
                  Moving to next word...
                </p>
              </div>
            )}

            <div className="mb-8">
              <button
                onClick={() => speak(currentWord.text)}
                className="bg-indigo-100 hover:bg-indigo-200 text-indigo-600 p-6 rounded-full transition-colors mb-4 inline-block shadow-sm"
              >
                <Volume2 size={48} />
              </button>
              <p className="text-sm text-slate-400">Click to listen again</p>
            </div>

            {/* Hint Section */}
            <div className="mb-6 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <p className="text-lg font-medium text-slate-800 mb-1">
                {currentWord.definition}
              </p>
              <p className="text-xs text-slate-500 italic">{currentWord.pos}</p>
            </div>

            <form onSubmit={handlePracticeSubmit}>
              <input
                autoFocus
                type="text"
                value={userInput}
                onChange={(e) =>
                  setPracticeSession((prev) => ({
                    ...prev,
                    userInput: e.target.value,
                  }))
                }
                placeholder="Type the word here..."
                disabled={feedback !== null}
                className={`w-full text-center text-xl p-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all
                  ${
                    feedback === "incorrect"
                      ? "border-red-300 bg-red-50"
                      : feedback === "correct"
                      ? "border-green-300 bg-green-50"
                      : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
                  }`}
              />
              <button
                type="submit"
                disabled={!userInput || feedback !== null}
                className="mt-6 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Check Answer
              </button>
            </form>
          </div>

          <div className="mt-6 text-slate-400 text-sm">
            Word {currentIndex + 1} of {queue.length}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans text-slate-900 bg-slate-50 min-h-screen">
      {view === "home" && renderHome()}
      {view === "list" && renderVocabList()}
      {view === "practice" && renderPractice()}
    </div>
  );
};

export default SpellingApp;
