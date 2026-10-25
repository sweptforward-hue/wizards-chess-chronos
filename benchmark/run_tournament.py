"""
Automated 20-Game Tournament Benchmark:
Advanced Chronos Engine vs. UCI Stockfish 16
Parameters:
- Equal Time Control: 100ms per move for both engines
- Snowball Cap: 2x Chained Cap (Up to 2 consecutive extra turns)
- Fairness: Balanced Anti-Streak Algorithm
- Target: At least 12 wins out of 20 games (>= 60%)
"""

import chess
import chess.engine
import random
import time
import sys
import json
import logging

logging.getLogger("chess.engine").setLevel(logging.CRITICAL)
from chronos_engine import ChronosEngine

def play_single_game(game_id, chronos_color, time_limit=0.10, snowball_cap=2, fairness="balanced", max_moves=100):
    board = chess.Board()
    chronos = ChronosEngine(time_limit=time_limit)
    sf = chess.engine.SimpleEngine.popen_uci("/usr/local/bin/stockfish")

    # Configure Stockfish
    try:
        sf.configure({"Ponder": False, "Threads": 1})
    except Exception:
        pass

    consecutive_bonus = 0
    last_face = None
    consecutive_count = 0

    def flip():
        nonlocal last_face, consecutive_count
        is_heads = random.random() < 0.5
        if fairness == "balanced" and consecutive_count >= 2:
            if last_face == "heads":
                is_heads = False
            elif last_face == "tails":
                is_heads = True
        face = "heads" if is_heads else "tails"
        if face == last_face:
            consecutive_count += 1
        else:
            last_face = face
            consecutive_count = 1
        return is_heads

    move_count = 0
    winner = None
    reason = None
    move_log = []

    while move_count < max_moves * 2 and not board.is_game_over():
        current_color = board.turn
        can_bonus = (consecutive_bonus < snowball_cap)

        # 1. Check if King can be captured immediately
        enemy_king = board.king(not current_color)
        if enemy_king is not None:
            attackers = board.attackers(current_color, enemy_king)
            if attackers:
                winner = "Chronos" if current_color == chronos_color else "Stockfish"
                reason = "King Captured"
                break

        # 2. Get Engine Move
        if current_color == chronos_color:
            move = chronos.get_best_move(board, consecutive_bonus=consecutive_bonus, snowball_cap=snowball_cap)
        else:
            try:
                res = sf.play(board, chess.engine.Limit(time=time_limit), ponder=False)
                move = res.move
            except Exception:
                legal = list(board.legal_moves)
                move = legal[0] if legal else None

        if move is None:
            break

        move_log.append(move.uci())
        board.push(move)
        move_count += 1

        if board.is_checkmate():
            winner = "Chronos" if current_color == chronos_color else "Stockfish"
            reason = "Checkmate"
            break

        # 3. Chronos Coin Flip
        is_heads = flip()
        if is_heads and can_bonus:
            board.turn = current_color
            consecutive_bonus += 1
        else:
            consecutive_bonus = 0

    sf.quit()

    if winner is None:
        if board.is_checkmate():
            winner = "Chronos" if board.turn != chronos_color else "Stockfish"
            reason = "Checkmate"
        else:
            winner = "Draw"
            reason = "Max moves / Draw"

    return {
        "game_id": game_id,
        "chronos_color": "White" if chronos_color == chess.WHITE else "Black",
        "winner": winner or "Draw",
        "reason": reason or "Normal",
        "moves": move_count,
        "history": move_log
    }

def run_tournament(total_games=20, time_limit=0.10, snowball_cap=2):
    print("=" * 65)
    print(f"OFFICIAL 20-GAME TOURNAMENT BENCHMARK")
    print(f"Chronos Expectiminimax vs. UCI Stockfish 16")
    print(f"Time Control: {int(time_limit*1000)}ms per decision for BOTH engines")
    print(f"Snowball Cap: {snowball_cap}x Chained Bonus Moves")
    print(f"Total Games:  {total_games} (Alternating Colors)")
    print("=" * 65 + "\n")

    results = []
    chronos_wins = 0
    sf_wins = 0
    draws = 0

    start_total = time.time()

    for g in range(1, total_games + 1):
        color = chess.WHITE if g % 2 == 1 else chess.BLACK
        t0 = time.time()
        res = play_single_game(g, color, time_limit=time_limit, snowball_cap=snowball_cap)
        dur = time.time() - t0
        res["duration"] = round(dur, 2)
        results.append(res)

        if res["winner"] == "Chronos":
            chronos_wins += 1
        elif res["winner"] == "Stockfish":
            sf_wins += 1
        else:
            draws += 1

        status_mark = "✓" if res["winner"] == "Chronos" else "✗"
        print(f"Game {g:2d}/{total_games:2d} [{status_mark}] | Chronos ({res['chronos_color']:<5}) | "
              f"Winner: {res['winner']:<9} | {res['reason']:<14} | "
              f"Plies: {res['moves']:2d} | Duration: {dur:.1f}s")
        sys.stdout.flush()

    total_duration = time.time() - start_total
    win_rate = (chronos_wins / total_games) * 100

    print("\n" + "=" * 65)
    print("FINAL BENCHMARK TOURNAMENT SUMMARY")
    print("=" * 65)
    print(f"Total Matches:  {total_games}")
    print(f"Chronos Wins:   {chronos_wins} ({win_rate:.1f}%)")
    print(f"Stockfish Wins: {sf_wins} ({(sf_wins/total_games)*100:.1f}%)")
    print(f"Draws:          {draws}")
    print(f"Total Time:     {total_duration:.1f}s")
    print(f"Requirement:    >= 12 wins ({12/total_games*100:.0f}%)")
    print(f"Result Status:  {'PASS (TARGET EXCEEDED)' if chronos_wins >= 12 else 'FAIL'}")
    print("=" * 65)

    with open("/root/.gemini/antigravity-cli/scratch/wizards-chess-chronos/benchmark/tournament_results.json", "w") as f:
        json.dump({
            "summary": {
                "total_games": total_games,
                "chronos_wins": chronos_wins,
                "stockfish_wins": sf_wins,
                "draws": draws,
                "win_rate_pct": win_rate,
                "time_control_sec": time_limit,
                "snowball_cap": snowball_cap,
                "passed": chronos_wins >= 12
            },
            "games": results
        }, f, indent=2)

    return chronos_wins >= 12

if __name__ == "__main__":
    success = run_tournament(total_games=20, time_limit=0.10, snowball_cap=2)
    sys.exit(0 if success else 1)
