# # -*- coding: utf-8 -*-
# from ltp import LTP
# import sqlite3

# def create_dependency_db(db_file="dependency_parsing.db"):
#     """创建用于存储依存语法分析结果的数据库"""
#     conn = sqlite3.connect(db_file)
#     cursor = conn.cursor()
    
#     # 创建句子表
#     cursor.execute('''
#     CREATE TABLE IF NOT EXISTS sentences (
#         sentence_id INTEGER PRIMARY KEY,
#         text TEXT NOT NULL
#     )
#     ''')
    
#     # 创建词语表，包含所有需要的属性
#     cursor.execute('''
#     CREATE TABLE IF NOT EXISTS tokens (
#         token_id INTEGER PRIMARY KEY,
#         sentence_id INTEGER NOT NULL,
#         position INTEGER NOT NULL,    -- 在句子中的位置索引
#         word TEXT NOT NULL,           -- 词语
#         pos_tag TEXT,                 -- 词性
#         dep_relation TEXT NOT NULL,   -- 依存关系标签
#         head_position INTEGER NOT NULL, -- 依存对象在句子中的索引
#         FOREIGN KEY (sentence_id) REFERENCES sentences (sentence_id)
#     )
#     ''')
    
#     # 创建索引以加速查询
#     cursor.execute('CREATE INDEX IF NOT EXISTS idx_tokens_sentence ON tokens (sentence_id)')
#     cursor.execute('CREATE INDEX IF NOT EXISTS idx_tokens_relation ON tokens (dep_relation)')
    
#     conn.commit()
#     return conn

# def insert_sentence(conn, sentence_text):
#     """插入一个新句子，并返回其sentence_id"""
#     cursor = conn.cursor()
#     cursor.execute('INSERT INTO sentences (text) VALUES (?)', (sentence_text,))
#     conn.commit()
#     return cursor.lastrowid

# def insert_tokens(conn, sentence_id, words, pos_tags, dep_labels, head_indices):
#     """插入一个句子的分词和依存分析结果"""
#     cursor = conn.cursor()
    
#     # 如果没有提供词性，创建一个空的列表
#     if pos_tags is None:
#         pos_tags = [None] * len(words)
    
#     # 准备数据
#     token_data = []
#     for i in range(len(words)):
#         position = i + 1  # 位置从1开始，与依存语法习惯一致
#         token_data.append((
#             sentence_id, 
#             position,
#             words[i],
#             pos_tags[i], 
#             dep_labels[i],
#             head_indices[i]
#         ))
    
#     # 批量插入数据
#     cursor.executemany(
#         '''INSERT INTO tokens 
#            (sentence_id, position, word, pos_tag, dep_relation, head_position) 
#            VALUES (?, ?, ?, ?, ?, ?)''',
#         token_data
#     )
    
#     conn.commit()

# def store_dependency_data(sentence_text, words, pos_tags, dep_labels, head_indices, db_file="dependency_parsing.db"):
#     """将句子的分词和依存分析结果存入数据库"""
#     # 连接到数据库
#     conn = create_dependency_db(db_file)
    
#     try:
#         # 插入句子
#         sentence_id = insert_sentence(conn, sentence_text)
        
#         # 插入分词和依存分析结果
#         insert_tokens(conn, sentence_id, words, pos_tags, dep_labels, head_indices)
        
#         print(f"成功将句子和{len(words)}个词语的依存分析结果存入数据库")
        
#     finally:
#         # 关闭数据库连接
#         conn.close()

# def analyze_and_store_sentence(sentence, db_file="dependency_parsing.db", model_path="small1"):
#     """使用LTP分析句子并存储结果到数据库"""
#     # 初始化LTP模型
#     ltp = LTP(model_path)
    
#     # 对输入句子进行分析
#     result = ltp.pipeline([sentence], tasks=["cws", "dep", "pos"])
    
#     # 提取分析结果
#     words = result.cws[0]  # 分词结果
#     head_indices = result.dep[0]['head']  # 依存关系的头节点索引
#     dep_labels = result.dep[0]['label']  # 依存关系标签
#     pos_tags = result.pos[0]  # 词性标注结果
    
#     # 存储到数据库
#     store_dependency_data(sentence, words, pos_tags, dep_labels, head_indices, db_file)
    
#     return {
#         'words': words,
#         'pos_tags': pos_tags,
#         'head_indices': head_indices,
#         'dep_labels': dep_labels
#     }

# def get_db_connection(db_file="dependency_parsing.db"):
#     """连接到数据库并返回连接对象"""
#     conn = sqlite3.connect(db_file)
#     conn.row_factory = sqlite3.Row  # 使结果可以通过列名访问
#     return conn

# def query_all_sentences(db_file="dependency_parsing.db"):
#     """查询所有句子"""
#     conn = get_db_connection(db_file)
#     cursor = conn.cursor()
    
#     cursor.execute('SELECT * FROM sentences')
#     sentences = cursor.fetchall()
    
#     conn.close()
#     print("===== 所有句子 =====")
#     for s in sentences:
#         print(f"ID: {s['sentence_id']}, 句子: {s['text'][:50]}...")
    
#     return sentences

# def query_tokens_by_sentence_id(sentence_id, db_file="dependency_parsing.db"):
#     """查询特定句子的所有词语"""
#     conn = get_db_connection(db_file)
#     cursor = conn.cursor()
    
#     cursor.execute('''
#     SELECT * FROM tokens 
#     WHERE sentence_id = ? 
#     ORDER BY position
#     ''', (sentence_id,))
    
#     tokens = cursor.fetchall()
#     conn.close()
    
#     print(f"\n===== 句子ID {sentence_id} 的所有词语 =====")
#     for t in tokens:
#         print(f"位置: {t['position']}, 词语: {t['word']}, 词性: {t['pos_tag']}, 依存关系: {t['dep_relation']}, 指向位置: {t['head_position']}")
    
#     return tokens

# def query_dependency_pairs(sentence_id, db_file="dependency_parsing.db"):
#     """查询特定句子中的依存对"""
#     conn = get_db_connection(db_file)
#     cursor = conn.cursor()
    
#     cursor.execute('''
#     SELECT t1.position, t1.word, t1.pos_tag, t1.dep_relation, 
#            t1.head_position, t2.word as head_word
#     FROM tokens t1
#     LEFT JOIN tokens t2 
#         ON t1.sentence_id = t2.sentence_id AND t1.head_position = t2.position
#     WHERE t1.sentence_id = ?
#     ORDER BY t1.position
#     ''', (sentence_id,))
    
#     pairs = cursor.fetchall()
#     conn.close()
    
#     print(f"\n===== 句子ID {sentence_id} 的依存对 =====")
#     for p in pairs:
#         if p['head_position'] == 0:
#             print(f"{p['word']}({p['pos_tag']}) --({p['dep_relation']})--> ROOT")
#         else:
#             print(f"{p['word']}({p['pos_tag']}) --({p['dep_relation']})--> {p['head_word']}(位置:{p['head_position']})")
    
#     return pairs

# # 示例用法
# def main():
#     # 数据库文件
#     db_file = "dependency_parsing.db"
    
#     # 示例1: 使用LTP分析并存储句子
#     print("\n===== 示例1: 使用LTP分析并存储句子 =====")
#     sentence1 = "县级以上各级人民政府劳动行政主管部门对矿山安全工作行使下列监督职责。"
#     result1 = analyze_and_store_sentence(sentence1, db_file)
    
#     # 示例2: 使用LTP分析并存储另一个句子
#     print("\n===== 示例2: 使用LTP分析并存储另一个句子 =====")
#     sentence2 = "县级以上人民政府管理矿山企业的主管部门对矿山安全工作行使下列管理职责。"
#     result2 = analyze_and_store_sentence(sentence2, db_file)
    
#     # 查询所有存储的句子
#     sentences = query_all_sentences(db_file)
    
#     # 查询并显示每个句子的详细信息
#     for sentence in sentences:
#         sentence_id = sentence['sentence_id']
#         query_tokens_by_sentence_id(sentence_id, db_file)
#         query_dependency_pairs(sentence_id, db_file)

# if __name__ == "__main__":
#     main()



# # -*- coding: utf-8 -*-
# import os
# import re
# import sqlite3
# from ltp import LTP

# def create_legal_dependency_db(db_file="legal_dependency.db"):
#     """创建用于存储法律文献依存语法分析结果的数据库"""
#     conn = sqlite3.connect(db_file)
#     cursor = conn.cursor()
#     return conn

# def create_document_table(conn, document_name):
#     """为每个法律文献创建一个表，不包含句子文本"""
#     cursor = conn.cursor()
    
#     # 创建文档表，使用文档名作为表名（确保表名合法）
#     table_name = re.sub(r'[^\w]', '_', document_name)
    
#     cursor.execute(f'''
#     CREATE TABLE IF NOT EXISTS "{table_name}" (
#         sentence_id INTEGER PRIMARY KEY,
#         article_index INTEGER NOT NULL,   -- 法条在文献中的索引
#         sentence_index INTEGER NOT NULL,  -- 句子在法条中的索引
#         position INTEGER NOT NULL,        -- 在句子中的位置索引
#         word TEXT NOT NULL,               -- 词语
#         pos_tag TEXT,                     -- 词性
#         dep_relation TEXT NOT NULL,       -- 依存关系标签
#         head_position INTEGER NOT NULL    -- 依存对象在句子中的索引
#     )
#     ''')
    
#     # 创建索引以加速查询
#     cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_article ON "{table_name}" (article_index)')
#     cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_sentence ON "{table_name}" (sentence_index)')
    
#     conn.commit()
    
#     return table_name

# def insert_legal_sentence(conn, table_name, article_index, sentence_index, 
#                          words, pos_tags, dep_labels, head_indices):
#     """插入一个法律句子的分析结果到指定表中，不包含句子文本"""
#     cursor = conn.cursor()
    
#     # 准备数据
#     sentence_data = []
#     for i in range(len(words)):
#         position = i + 1  # 位置从1开始，与依存语法习惯一致
#         sentence_data.append((
#             article_index,
#             sentence_index,
#             position,
#             words[i],
#             pos_tags[i], 
#             dep_labels[i],
#             head_indices[i]
#         ))
    
#     # 批量插入数据
#     cursor.executemany(
#         f'''INSERT INTO "{table_name}" 
#            (article_index, sentence_index, position, word, pos_tag, dep_relation, head_position) 
#            VALUES (?, ?, ?, ?, ?, ?, ?)''',
#         sentence_data
#     )
    
#     conn.commit()

# def process_legal_documents(folder_path, db_file="legal_dependency.db", model_path="small1"):
#     """处理文件夹中的所有法律文献文件"""
#     # 初始化LTP模型
#     ltp = LTP(model_path)
    
#     # 连接到数据库
#     conn = create_legal_dependency_db(db_file)
    
#     try:
#         # 遍历文件夹中的所有txt文件
#         for filename in os.listdir(folder_path):
#             if filename.endswith('.txt'):
#                 document_path = os.path.join(folder_path, filename)
#                 document_name = os.path.splitext(filename)[0]
                
#                 print(f"处理文档: {document_name}")
                
#                 # 为该文档创建表
#                 table_name = create_document_table(conn, document_name)
                
#                 # 读取文档内容
#                 with open(document_path, 'r', encoding='utf-8') as file:
#                     lines = file.readlines()
                
#                 # 处理每一行（每行对应一个法条）
#                 for article_index, article_text in enumerate(lines, 1):
#                     article_text = article_text.strip()
#                     if not article_text:
#                         continue
                    
#                     # 将法条分割成句子（按句号分隔）
#                     sentences = re.split(r'[。！？]', article_text)
#                     sentences = [s.strip() for s in sentences if s.strip()]
                    
#                     # 处理每个句子
#                     for sentence_index, sentence in enumerate(sentences, 1):
#                         # 使用LTP进行分析
#                         result = ltp.pipeline([sentence], tasks=["cws", "dep", "pos"])
                        
#                         # 提取分析结果
#                         words = result.cws[0]
#                         head_indices = result.dep[0]['head']
#                         dep_labels = result.dep[0]['label']
#                         pos_tags = result.pos[0]
                        
#                         # 存储分析结果（不包含句子文本）
#                         insert_legal_sentence(
#                             conn, table_name, article_index, sentence_index,
#                             words, pos_tags, dep_labels, head_indices
#                         )
                        
#                         print(f"  处理完成: 法条 {article_index}, 句子 {sentence_index}")
    
#     finally:
#         # 关闭数据库连接
#         conn.close()

# def main():
#     """主函数"""
#     import argparse
    
#     # 创建命令行参数解析器
#     parser = argparse.ArgumentParser(description='对法律文献进行依存句法分析并存储结果（不含句子文本）')
#     parser.add_argument('folder_path', help='包含法律文献txt文件的文件夹路径')
#     parser.add_argument('--db', default='legal_dependency.db', help='数据库文件路径')
#     parser.add_argument('--model', default='small1', help='LTP模型路径或预设名称')
    
#     # 解析命令行参数
#     args = parser.parse_args()
    
#     # 执行处理
#     process_legal_documents(args.folder_path, args.db, args.model)
    
#     print(f"所有法律文献已处理完成，结果存储在数据库: {args.db}")

# if __name__ == "__main__":
#     main()

# -*- coding: utf-8 -*-
import os
import re
import sqlite3
from ltp import LTP

def create_legal_dependency_db(db_file="laws_dependency.db"):
    """创建用于存储法律文献依存语法分析结果的数据库"""
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    return conn

def create_document_table(conn, document_name):
    """为每个法律文献创建一个表，不包含句子文本"""
    cursor = conn.cursor()
    
    # 创建文档表，使用文档名作为表名（保留原始表名，不替换特殊字符）
    table_name = document_name
    
    cursor.execute(f'''
    CREATE TABLE IF NOT EXISTS "{table_name}" (
        article_index INTEGER NOT NULL,   -- 法条在文献中的索引
        sentence_index INTEGER NOT NULL,  -- 句子在法条中的索引
        position INTEGER NOT NULL,        -- 在句子中的位置索引
        word TEXT NOT NULL,               -- 词语
        pos_tag TEXT,                     -- 词性
        dep_relation TEXT NOT NULL,       -- 依存关系标签
        head_position INTEGER NOT NULL,   -- 依存对象在句子中的索引
        PRIMARY KEY (article_index, sentence_index, position)
    )
    ''')
    
    # 创建索引以加速查询
    # 对表名进行处理，替换非字母数字字符为下划线
    safe_table_name = re.sub(r'[^\w]', '_', table_name)
    cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{safe_table_name}_article ON "{table_name}" (article_index)')
    cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{safe_table_name}_sentence ON "{table_name}" (sentence_index)')
    
    conn.commit()
    
    return table_name

def insert_legal_sentence(conn, table_name, article_index, sentence_index, 
                         words, pos_tags, dep_labels, head_indices):
    """插入一个法律句子的分析结果到指定表中，不包含句子文本"""
    cursor = conn.cursor()
    
    # 准备数据
    sentence_data = []
    for i in range(len(words)):
        position = i + 1  # 位置从1开始，与依存语法习惯一致
        sentence_data.append((
            article_index,
            sentence_index,
            position,
            words[i],
            pos_tags[i], 
            dep_labels[i],
            head_indices[i]
        ))
    
    # 批量插入数据
    cursor.executemany(
        f'''INSERT INTO "{table_name}" 
           (article_index, sentence_index, position, word, pos_tag, dep_relation, head_position) 
           VALUES (?, ?, ?, ?, ?, ?, ?)''',
        sentence_data
    )
    
    conn.commit()

def process_legal_documents(folder_path, db_file="legal_dependency.db", model_path="small1"):
    """处理文件夹中的所有法律文献文件"""
    # 初始化LTP模型
    ltp = LTP(model_path)
    
    # 连接到数据库
    conn = create_legal_dependency_db(db_file)
    
    try:
        # 遍历文件夹中的所有txt文件
        for filename in os.listdir(folder_path):
            if filename.endswith('.txt'):
                document_path = os.path.join(folder_path, filename)
                document_name = os.path.splitext(filename)[0]
                
                print(f"处理文档: {document_name}")
                
                # 为该文档创建表
                table_name = create_document_table(conn, document_name)
                
                # 读取文档内容
                with open(document_path, 'r', encoding='utf-8') as file:
                    lines = file.readlines()
                
                # 处理每一行（每行对应一个法条）
                for article_index, article_text in enumerate(lines, 1):
                    article_text = article_text.strip()
                    if not article_text:
                        continue
                    
                    # 将法条分割成句子（按句号分隔），同时保留句末标点
                    # 使用正则表达式的前向查找来匹配句子边界，但不消耗这些字符
                    sentences = []
                    pattern = re.compile(r'[^。！？]*[。！？]')
                    matches = pattern.findall(article_text)
                    sentences = [s.strip() for s in matches if s.strip()]
                    
                    # 处理可能的最后一句（没有标点符号结尾）
                    last_sentence = pattern.sub('', article_text).strip()
                    if last_sentence:
                        sentences.append(last_sentence)
                    
                    # 处理每个句子
                    for sentence_index, sentence in enumerate(sentences, 1):
                        # 使用LTP进行分析
                        result = ltp.pipeline([sentence], tasks=["cws", "dep", "pos"])
                        
                        # 提取分析结果
                        words = result.cws[0]
                        head_indices = result.dep[0]['head']
                        dep_labels = result.dep[0]['label']
                        pos_tags = result.pos[0]
                        
                        # 存储分析结果（不包含句子文本）
                        insert_legal_sentence(
                            conn, table_name, article_index, sentence_index,
                            words, pos_tags, dep_labels, head_indices
                        )
                        
                        print(f"  处理完成: 法条 {article_index}, 句子 {sentence_index}")
    
    finally:
        # 关闭数据库连接
        conn.close()

def main():
    """主函数"""
    import argparse
    
    # 创建命令行参数解析器
    parser = argparse.ArgumentParser(description='对法律文献进行依存句法分析并存储结果（不含句子文本）')
    parser.add_argument('folder_path', help='包含法律文献txt文件的文件夹路径')
    parser.add_argument('--db', default='laws_dependency.db', help='数据库文件路径')
    parser.add_argument('--model', default='small1', help='LTP模型路径或预设名称')
    
    # 解析命令行参数
    args = parser.parse_args()
    
    # 执行处理
    process_legal_documents(args.folder_path, args.db, args.model)
    
    print(f"所有法律文献已处理完成，结果存储在数据库: {args.db}")

if __name__ == "__main__":
    main()