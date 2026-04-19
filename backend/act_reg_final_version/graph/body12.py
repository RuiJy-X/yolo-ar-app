import numpy as np

class Graph():
    def __init__(self, labeling_mode='spatial'):
        self.num_node = 12
        self.self_link = [(i, i) for i in range(self.num_node)]
        
        # Mapping: 0:L-Shoulder, 1:R-Shoulder, 2:L-Elbow, 3:R-Elbow, 4:L-Wrist, 5:R-Wrist,
        # 6:L-Hip, 7:R-Hip, 8:L-Knee, 9:R-Knee, 10:L-Ankle, 11:R-Ankle
        self.neighbor_link = [
            (0, 1), (0, 2), (2, 4), # Upper body
            (1, 3), (3, 5), 
            (0, 6), (1, 7),         # Torso links
            (6, 7), (6, 8), (8, 10),# Lower body
            (7, 9), (9, 11)
        ]
        
        self.edge = self.self_link + self.neighbor_link
        self.hop_dis = get_hop_distance(self.num_node, self.edge, max_hop=1)
        self.get_adjacency(labeling_mode)

    def get_adjacency(self, labeling_mode):
        valid_hop = range(0, 1 + 1)
        adjacency = np.zeros((self.num_node, self.num_node))
        for hop in valid_hop:
            adjacency[self.hop_dis == hop] = 1
        
        self.A_norm = normalize_digraph(adjacency)

        if labeling_mode == 'spatial':
            A = []
            for i in range(3):
                A.append(np.zeros((self.num_node, self.num_node)))
            A[0] = np.eye(self.num_node) # Self
            A[1] = adjacency - np.eye(self.num_node) # Neighbors
            self.A = np.stack(A)
        else:
            self.A = self.A_norm

def get_hop_distance(num_node, edge, max_hop=1):
    A = np.zeros((num_node, num_node))
    for i, j in edge:
        A[i, j] = 1
        A[j, i] = 1
    hop_dis = np.zeros((num_node, num_node)) + np.inf
    transfer_mat = [np.linalg.matrix_power(A, d) for d in range(max_hop + 1)]
    arrive_mat = (np.stack(transfer_mat) > 0)
    for d in range(max_hop, -1, -1):
        hop_dis[arrive_mat[d]] = d
    return hop_dis

def normalize_digraph(A):
    Dl = np.sum(A, 0)
    num_node = A.shape[0]
    Dn = np.zeros((num_node, num_node))
    for i in range(num_node):
        if Dl[i] > 0:
            Dn[i, i] = Dl[i]**(-1)
    return np.dot(A, Dn)